use crate::db::DbState;
use crate::http::{HttpRequestPayload, HttpResponsePayload, KeyValue, MultipartField};
use moka::sync::Cache;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_MEMORY_WEIGHT: u64 = 96 * 1024 * 1024;
const DEFAULT_TTL: Duration = Duration::from_secs(900);
const MAX_TTL: Duration = Duration::from_secs(86_400);
const DISK_MAX_ENTRIES: u64 = 2_000;
/// Skip caching responses larger than this (body string length ≈ decoded size).
pub const MAX_CACHE_BODY_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone)]
struct CachedEntry {
    response: HttpResponsePayload,
    cached_at_ms: u64,
    expires_at_ms: u64,
}

#[derive(Clone, Debug)]
pub struct CacheConfig {
    pub enabled: bool,
    pub default_ttl: Duration,
    pub disk_enabled: bool,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            default_ttl: DEFAULT_TTL,
            disk_enabled: true,
        }
    }
}

impl CacheConfig {
    pub fn from_settings(settings: &crate::settings::AppSettings) -> Self {
        Self {
            enabled: settings.http_cache_enabled,
            default_ttl: Duration::from_secs(settings.http_cache_ttl_sec.clamp(30, 86_400)),
            disk_enabled: settings.http_cache_disk_enabled,
        }
    }
}

#[derive(Clone, Debug)]
pub struct CacheValidators {
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub stale_response: HttpResponsePayload,
    pub cached_at_ms: u64,
}

pub struct ResponseCache {
    inner: Cache<String, CachedEntry>,
    disk: Mutex<Option<Arc<DbState>>>,
    config: Mutex<CacheConfig>,
    memory_hits: AtomicU64,
    disk_hits: AtomicU64,
    revalidations: AtomicU64,
}

impl ResponseCache {
    pub fn new(config: CacheConfig) -> Self {
        Self {
            inner: Cache::builder()
                .max_capacity(MAX_MEMORY_WEIGHT)
                .weigher(|_key, value: &CachedEntry| entry_weight(&value.response))
                .time_to_idle(MAX_TTL)
                .build(),
            disk: Mutex::new(None),
            config: Mutex::new(config),
            memory_hits: AtomicU64::new(0),
            disk_hits: AtomicU64::new(0),
            revalidations: AtomicU64::new(0),
        }
    }

    pub fn attach_disk(&self, db: Arc<DbState>) {
        *self.disk.lock().expect("disk lock") = Some(db);
    }

    pub fn apply_config(&self, config: CacheConfig) {
        *self.config.lock().expect("config lock") = config;
    }

    pub fn config(&self) -> CacheConfig {
        self.config.lock().expect("config lock").clone()
    }

    pub fn get_response(&self, key: &str) -> Option<HttpResponsePayload> {
        let config = self.config();
        if !config.enabled {
            return None;
        }

        let now = now_ms();

        if let Some(entry) = self.inner.get(key) {
            if entry.expires_at_ms > now {
                self.memory_hits.fetch_add(1, Ordering::Relaxed);
                return Some(wrap_cached_response(entry.response, entry.cached_at_ms, false));
            }
            self.inner.invalidate(key);
        }

        if !config.disk_enabled {
            return None;
        }

        let disk = self.disk.lock().expect("disk lock").clone()?;
        let disk_entry = disk.cache_get(key, now).ok()??;
        let response: HttpResponsePayload = serde_json::from_str(&disk_entry.response_json).ok()?;

        self.disk_hits.fetch_add(1, Ordering::Relaxed);
        self.inner.insert(
            key.to_string(),
            CachedEntry {
                response: response.clone(),
                cached_at_ms: disk_entry.cached_at_ms,
                expires_at_ms: disk_entry.expires_at_ms,
            },
        );

        Some(wrap_cached_response(response, disk_entry.cached_at_ms, true))
    }

    /// Expired (or about-to-expire) entry with validators for conditional GET.
    pub fn get_stale_validators(&self, key: &str) -> Option<CacheValidators> {
        let config = self.config();
        if !config.enabled {
            return None;
        }

        let now = now_ms();

        if let Some(entry) = self.inner.get(key) {
            if entry.expires_at_ms <= now {
                return validators_from_entry(&entry.response, entry.cached_at_ms);
            }
        }

        if !config.disk_enabled {
            return None;
        }

        let disk = self.disk.lock().expect("disk lock").clone()?;
        let disk_entry = disk.cache_get_any(key).ok()??;
        if disk_entry.expires_at_ms > now {
            return None;
        }
        let response: HttpResponsePayload = serde_json::from_str(&disk_entry.response_json).ok()?;
        validators_from_entry(&response, disk_entry.cached_at_ms)
    }

    pub fn record_revalidation(&self) {
        self.revalidations.fetch_add(1, Ordering::Relaxed);
    }

    pub fn insert(&self, key: String, response: HttpResponsePayload) {
        let config = self.config();
        if !config.enabled {
            return;
        }

        if response.size_bytes > MAX_CACHE_BODY_BYTES || response.body.len() > MAX_CACHE_BODY_BYTES {
            return;
        }

        let cached_at_ms = now_ms();
        let ttl = cache_ttl_from_response(&response, config.default_ttl);
        if ttl.is_zero() {
            return;
        }
        let expires_at_ms = cached_at_ms.saturating_add(ttl.as_millis() as u64);

        let entry = CachedEntry {
            response: response.clone(),
            cached_at_ms,
            expires_at_ms,
        };

        self.inner.insert(key.clone(), entry);

        if !config.disk_enabled {
            return;
        }

        let disk = match self.disk.lock().expect("disk lock").clone() {
            Some(db) => db,
            None => return,
        };

        // Disk I/O off the request path.
        thread::spawn(move || {
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = disk.cache_put(
                    &key,
                    &json,
                    cached_at_ms,
                    expires_at_ms,
                    response.size_bytes,
                    DISK_MAX_ENTRIES,
                );
                let _ = disk.cache_prune_expired(now_ms());
            }
        });
    }

    pub fn clear(&self) -> u64 {
        let memory = self.inner.entry_count();
        self.inner.invalidate_all();

        let disk = self
            .disk
            .lock()
            .expect("disk lock")
            .clone()
            .and_then(|db| db.cache_clear().ok())
            .unwrap_or(0);

        memory.saturating_add(disk)
    }

    pub fn memory_len(&self) -> u64 {
        self.inner.entry_count()
    }

    pub fn disk_len(&self) -> u64 {
        self.disk
            .lock()
            .expect("disk lock")
            .clone()
            .and_then(|db| db.cache_count().ok())
            .unwrap_or(0)
    }

    pub fn hits(&self) -> u64 {
        self.memory_hits.load(Ordering::Relaxed)
            + self.disk_hits.load(Ordering::Relaxed)
            + self.revalidations.load(Ordering::Relaxed)
    }

    pub fn memory_hits(&self) -> u64 {
        self.memory_hits.load(Ordering::Relaxed)
    }

    pub fn disk_hits(&self) -> u64 {
        self.disk_hits.load(Ordering::Relaxed)
    }

    pub fn revalidations(&self) -> u64 {
        self.revalidations.load(Ordering::Relaxed)
    }

    pub fn prune_expired(&self) {
        let now = now_ms();
        if let Some(disk) = self.disk.lock().expect("disk lock").clone() {
            let _ = disk.cache_prune_expired(now);
        }
    }
}

impl Default for ResponseCache {
    fn default() -> Self {
        Self::new(CacheConfig::default())
    }
}

fn validators_from_entry(response: &HttpResponsePayload, cached_at_ms: u64) -> Option<CacheValidators> {
    let etag = header_value(response, "etag");
    let last_modified = header_value(response, "last-modified");
    if etag.is_none() && last_modified.is_none() {
        return None;
    }
    Some(CacheValidators {
        etag,
        last_modified,
        stale_response: response.clone(),
        cached_at_ms,
    })
}

fn header_value(response: &HttpResponsePayload, name: &str) -> Option<String> {
    response.headers.iter().find_map(|header| {
        if header.key.eq_ignore_ascii_case(name) {
            let value = header.value.trim();
            if value.is_empty() {
                None
            } else {
                Some(value.to_string())
            }
        } else {
            None
        }
    })
}

fn wrap_cached_response(
    response: HttpResponsePayload,
    cached_at_ms: u64,
    from_disk: bool,
) -> HttpResponsePayload {
    let age_ms = now_ms().saturating_sub(cached_at_ms);
    HttpResponsePayload {
        elapsed_ms: if from_disk { 1 } else { 0 },
        from_cache: true,
        cache_age_ms: Some(age_ms),
        request_id: None,
        ..response
    }
}

fn entry_weight(response: &HttpResponsePayload) -> u32 {
    let bytes = response
        .body
        .len()
        .saturating_add(response.headers.len().saturating_mul(64))
        .saturating_add(256);
    bytes.min(u32::MAX as usize) as u32
}

const IGNORED_CACHE_HEADERS: &[&str] = &[
    "accept-encoding",
    "connection",
    "keep-alive",
    "proxy-connection",
    "transfer-encoding",
    "te",
    "trailer",
    "upgrade",
    "cookie",
    "content-length",
];

pub fn cache_key(payload: &HttpRequestPayload) -> String {
    let mut hasher = Sha256::new();

    hasher.update(payload.method.trim().to_uppercase().as_bytes());
    hasher.update(b"|");
    hasher.update(payload.url.trim().as_bytes());
    hasher.update(b"|");

    let headers: Vec<_> = enabled_sorted_pairs(&payload.headers)
        .into_iter()
        .filter(|(key, _)| !IGNORED_CACHE_HEADERS.contains(&key.as_str()))
        .collect();
    hash_sorted_pairs(&mut hasher, &headers);
    hasher.update(b"|");
    hash_sorted_pairs(&mut hasher, &enabled_sorted_pairs(&payload.query));
    hasher.update(b"|");
    hasher.update(payload.body_kind.as_bytes());
    hasher.update(b"|");
    hasher.update(payload.body.as_bytes());
    hasher.update(b"|");
    hash_sorted_pairs(&mut hasher, &enabled_sorted_pairs(&payload.form));
    hasher.update(b"|");
    hash_multipart(&mut hasher, &payload.multipart);
    hasher.update(b"|");
    hasher.update(payload.auth.auth_type.as_bytes());

    if let Some(token) = payload.auth.bearer_token.as_deref() {
        hasher.update(token.as_bytes());
    }
    if let Some(user) = payload.auth.basic_username.as_deref() {
        hasher.update(user.as_bytes());
    }
    if let Some(pass) = payload.auth.basic_password.as_deref() {
        hasher.update(pass.as_bytes());
    }
    if let Some(key) = payload.auth.api_key_key.as_deref() {
        hasher.update(key.as_bytes());
    }
    if let Some(value) = payload.auth.api_key_value.as_deref() {
        hasher.update(value.as_bytes());
    }
    if let Some(location) = payload.auth.api_key_in.as_deref() {
        hasher.update(location.as_bytes());
    }

    format!("{:x}", hasher.finalize())
}

fn enabled_sorted_pairs(items: &[KeyValue]) -> Vec<(String, String)> {
    let mut pairs: Vec<_> = items
        .iter()
        .filter(|item| item.enabled && !item.key.trim().is_empty())
        .map(|item| (item.key.trim().to_lowercase(), item.value.clone()))
        .collect();
    pairs.sort_by(|a, b| a.0.cmp(&b.0));
    pairs
}

fn hash_sorted_pairs(hasher: &mut Sha256, pairs: &[(String, String)]) {
    for (key, value) in pairs {
        hasher.update(key.as_bytes());
        hasher.update(b"=");
        hasher.update(value.as_bytes());
        hasher.update(b";");
    }
}

fn hash_multipart(hasher: &mut Sha256, fields: &[MultipartField]) {
    let mut entries: Vec<_> = fields
        .iter()
        .filter(|field| field.enabled && !field.key.trim().is_empty())
        .map(|field| {
            (
                field.key.trim().to_lowercase(),
                field.field_type.clone(),
                field.value.clone(),
                field.file_name.clone().unwrap_or_default(),
                field.mime_type.clone().unwrap_or_default(),
            )
        })
        .collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    for (key, field_type, value, file_name, mime_type) in entries {
        hasher.update(key.as_bytes());
        hasher.update(b":");
        hasher.update(field_type.as_bytes());
        hasher.update(b":");
        hasher.update(file_name.as_bytes());
        hasher.update(b":");
        hasher.update(mime_type.as_bytes());
        hasher.update(b"=");
        hasher.update(value.as_bytes());
        hasher.update(b";");
    }
}

pub fn should_use_cache(payload: &HttpRequestPayload, config: &CacheConfig) -> bool {
    if !config.enabled {
        return false;
    }

    if payload.use_cache == Some(false) {
        return false;
    }

    let method = payload.method.trim().to_uppercase();
    if method != "GET" && method != "HEAD" {
        return payload.use_cache == Some(true);
    }

    if request_opted_out(payload) {
        return false;
    }

    payload.use_cache.unwrap_or(true)
}

pub fn should_store_in_cache(
    payload: &HttpRequestPayload,
    response: &HttpResponsePayload,
    config: &CacheConfig,
) -> bool {
    if !should_use_cache(payload, config) {
        return false;
    }

    if !(200..300).contains(&response.status) {
        return false;
    }

    if response.size_bytes > MAX_CACHE_BODY_BYTES || response.body.len() > MAX_CACHE_BODY_BYTES {
        return false;
    }

    if response_has_no_store(response) {
        return false;
    }

    if cache_ttl_from_response(response, config.default_ttl).is_zero() {
        return false;
    }

    true
}

pub fn cache_ttl_from_response(response: &HttpResponsePayload, default_ttl: Duration) -> Duration {
    for header in &response.headers {
        if header.key.eq_ignore_ascii_case("cache-control") {
            let value = header.value.to_ascii_lowercase();
            if value.contains("no-store") || value.contains("no-cache") {
                return Duration::ZERO;
            }
            if let Some(max_age) = parse_age_directive(&header.value, "s-maxage")
                .or_else(|| parse_age_directive(&header.value, "max-age"))
            {
                return Duration::from_secs(max_age.min(MAX_TTL.as_secs()));
            }
        }
        if header.key.eq_ignore_ascii_case("expires") {
            if let Some(ttl) = ttl_from_expires(&header.value) {
                return ttl.min(MAX_TTL);
            }
        }
    }
    default_ttl
}

fn parse_age_directive(value: &str, name: &str) -> Option<u64> {
    let needle = format!("{name}=");
    for directive in value.split(',') {
        let lower = directive.trim().to_ascii_lowercase();
        if let Some(seconds) = lower.strip_prefix(&needle) {
            return seconds.trim().trim_matches('"').parse().ok();
        }
    }
    None
}

fn ttl_from_expires(value: &str) -> Option<Duration> {
    let trimmed = value.trim();
    if trimmed.eq_ignore_ascii_case("0") || trimmed.is_empty() {
        return Some(Duration::ZERO);
    }
    let expires = httpdate::parse_http_date(trimmed).ok()?;
    let now = SystemTime::now();
    match expires.duration_since(now) {
        Ok(ttl) => Some(ttl.min(MAX_TTL)),
        Err(_) => Some(Duration::ZERO),
    }
}

fn request_opted_out(payload: &HttpRequestPayload) -> bool {
    payload.headers.iter().any(|header| {
        if !header.enabled {
            return false;
        }
        let key = header.key.trim().to_ascii_lowercase();
        let value = header.value.trim().to_ascii_lowercase();
        matches!(key.as_str(), "cache-control" | "pragma")
            && (value.contains("no-cache") || value.contains("no-store"))
    })
}

fn response_has_no_store(response: &HttpResponsePayload) -> bool {
    response.headers.iter().any(|header| {
        if !header.key.eq_ignore_ascii_case("cache-control") {
            return false;
        }
        let value = header.value.to_ascii_lowercase();
        value.contains("no-store") || value.contains("no-cache")
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}

#[cfg(test)]
#[path = "__tests__/cache_tests.rs"]
mod tests;
