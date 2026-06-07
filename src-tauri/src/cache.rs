use crate::db::DbState;
use crate::http::{HttpRequestPayload, HttpResponsePayload, KeyValue, MultipartField};
use moka::sync::Cache;
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const MAX_MEMORY_WEIGHT: u64 = 64 * 1024 * 1024;
const DEFAULT_TTL: Duration = Duration::from_secs(900);
const MAX_TTL: Duration = Duration::from_secs(86_400);
const DISK_MAX_ENTRIES: u64 = 2_000;

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

pub struct ResponseCache {
    inner: Cache<String, CachedEntry>,
    disk: Mutex<Option<Arc<DbState>>>,
    config: Mutex<CacheConfig>,
    memory_hits: AtomicU64,
    disk_hits: AtomicU64,
}

impl ResponseCache {
    pub fn new(config: CacheConfig) -> Self {
        Self {
            inner: Cache::builder()
                .max_capacity(MAX_MEMORY_WEIGHT)
                .weigher(|_key, value: &CachedEntry| entry_weight(&value.response))
                .build(),
            disk: Mutex::new(None),
            config: Mutex::new(config),
            memory_hits: AtomicU64::new(0),
            disk_hits: AtomicU64::new(0),
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

    pub fn insert(&self, key: String, response: HttpResponsePayload) {
        let config = self.config();
        if !config.enabled {
            return;
        }

        let cached_at_ms = now_ms();
        let ttl = cache_ttl_from_response(&response, config.default_ttl);
        let expires_at_ms = cached_at_ms.saturating_add(ttl.as_millis() as u64);

        let entry = CachedEntry {
            response: response.clone(),
            cached_at_ms,
            expires_at_ms,
        };

        self.inner.insert(key.clone(), entry);

        if config.disk_enabled {
            if let Some(disk) = self.disk.lock().expect("disk lock").clone() {
                if let Ok(json) = serde_json::to_string(&response) {
                    let _ = disk.cache_put(
                        &key,
                        &json,
                        cached_at_ms,
                        expires_at_ms,
                        response.size_bytes,
                        DISK_MAX_ENTRIES,
                    );
                }
            }
        }
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
        self.memory_hits.load(Ordering::Relaxed) + self.disk_hits.load(Ordering::Relaxed)
    }

    pub fn memory_hits(&self) -> u64 {
        self.memory_hits.load(Ordering::Relaxed)
    }

    pub fn disk_hits(&self) -> u64 {
        self.disk_hits.load(Ordering::Relaxed)
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

pub fn cache_key(payload: &HttpRequestPayload) -> String {
    let mut hasher = Sha256::new();

    hasher.update(payload.method.trim().to_uppercase().as_bytes());
    hasher.update(b"|");
    hasher.update(payload.url.trim().as_bytes());
    hasher.update(b"|");

    hash_sorted_pairs(&mut hasher, &enabled_sorted_pairs(&payload.headers));
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

    if response_has_no_store(response) {
        return false;
    }

    true
}

pub fn cache_ttl_from_response(response: &HttpResponsePayload, default_ttl: Duration) -> Duration {
    for header in &response.headers {
        if header.key.eq_ignore_ascii_case("cache-control") {
            if let Some(max_age) = parse_max_age(&header.value) {
                return Duration::from_secs(max_age.min(MAX_TTL.as_secs()));
            }
            let value = header.value.to_ascii_lowercase();
            if value.contains("no-store") {
                return Duration::ZERO;
            }
        }
    }
    default_ttl
}

fn parse_max_age(value: &str) -> Option<u64> {
    for directive in value.split(',') {
        let directive = directive.trim();
        if let Some(seconds) = directive.strip_prefix("max-age=") {
            return seconds.trim().parse().ok();
        }
    }
    None
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
        header.value.to_ascii_lowercase().contains("no-store")
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{AuthConfig, ResponseHeader};

    fn sample_payload(method: &str) -> HttpRequestPayload {
        HttpRequestPayload {
            method: method.to_string(),
            url: "https://example.com/data".to_string(),
            headers: vec![],
            query: vec![],
            body_kind: "none".to_string(),
            body: String::new(),
            form: vec![],
            multipart: vec![],
            auth: AuthConfig {
                auth_type: "none".to_string(),
                bearer_token: None,
                basic_username: None,
                basic_password: None,
                api_key_key: None,
                api_key_value: None,
                api_key_in: None,
            },
            use_cache: None,
            request_id: None,
            timeout_ms: None,
        }
    }

    fn sample_response(status: u16) -> HttpResponsePayload {
        HttpResponsePayload {
            status,
            status_text: "OK".to_string(),
            headers: vec![ResponseHeader {
                key: "Cache-Control".to_string(),
                value: "no-store".to_string(),
            }],
            body: String::new(),
            elapsed_ms: 10,
            size_bytes: 0,
            content_type: None,
            from_cache: false,
            cache_age_ms: None,
            request_id: None,
        }
    }

    #[test]
    fn get_requests_use_cache_by_default() {
        assert!(should_use_cache(
            &sample_payload("GET"),
            &CacheConfig::default()
        ));
    }

    #[test]
    fn post_requests_skip_cache_by_default() {
        assert!(!should_use_cache(
            &sample_payload("POST"),
            &CacheConfig::default()
        ));
    }

    #[test]
    fn does_not_store_failed_responses() {
        assert!(!should_store_in_cache(
            &sample_payload("GET"),
            &sample_response(500),
            &CacheConfig::default()
        ));
    }

    #[test]
    fn cache_key_is_stable_for_same_payload() {
        let left = cache_key(&sample_payload("GET"));
        let right = cache_key(&sample_payload("GET"));
        assert_eq!(left, right);
    }

    #[test]
    fn cache_key_changes_with_form_fields() {
        let mut left = sample_payload("POST");
        left.form.push(KeyValue {
            key: "a".to_string(),
            value: "1".to_string(),
            enabled: true,
        });

        let mut right = sample_payload("POST");
        right.form.push(KeyValue {
            key: "b".to_string(),
            value: "2".to_string(),
            enabled: true,
        });

        assert_ne!(cache_key(&left), cache_key(&right));
    }

    #[test]
    fn request_cache_control_opt_out() {
        let mut payload = sample_payload("GET");
        payload.headers.push(KeyValue {
            key: "Cache-Control".to_string(),
            value: "no-cache".to_string(),
            enabled: true,
        });
        assert!(!should_use_cache(&payload, &CacheConfig::default()));
    }

    #[test]
    fn parses_max_age_from_response() {
        let response = HttpResponsePayload {
            status: 200,
            status_text: "OK".to_string(),
            headers: vec![ResponseHeader {
                key: "Cache-Control".to_string(),
                value: "public, max-age=120".to_string(),
            }],
            body: String::new(),
            elapsed_ms: 1,
            size_bytes: 0,
            content_type: None,
            from_cache: false,
            cache_age_ms: None,
            request_id: None,
        };

        assert_eq!(
            cache_ttl_from_response(&response, DEFAULT_TTL),
            Duration::from_secs(120)
        );
    }

    #[test]
    fn private_responses_can_be_cached() {
        let response = HttpResponsePayload {
            status: 200,
            status_text: "OK".to_string(),
            headers: vec![ResponseHeader {
                key: "Cache-Control".to_string(),
                value: "private, max-age=60".to_string(),
            }],
            body: "ok".to_string(),
            elapsed_ms: 1,
            size_bytes: 2,
            content_type: None,
            from_cache: false,
            cache_age_ms: None,
            request_id: None,
        };

        assert!(should_store_in_cache(
            &sample_payload("GET"),
            &response,
            &CacheConfig::default()
        ));
    }
}
