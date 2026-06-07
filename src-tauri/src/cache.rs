use crate::http::{HttpRequestPayload, HttpResponsePayload};
use moka::sync::Cache;
use sha2::{Digest, Sha256};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DEFAULT_TTL: Duration = Duration::from_secs(300);
const MAX_ENTRIES: u64 = 256;

#[derive(Clone)]
struct CachedEntry {
    response: HttpResponsePayload,
    cached_at_ms: u64,
}

pub struct ResponseCache {
    inner: Cache<String, CachedEntry>,
}

impl ResponseCache {
    pub fn new() -> Self {
        Self {
            inner: Cache::builder()
                .max_capacity(MAX_ENTRIES)
                .time_to_live(DEFAULT_TTL)
                .build(),
        }
    }

    pub fn get_response(&self, key: &str) -> Option<HttpResponsePayload> {
        self.inner.get(key).map(|entry| {
            let age_ms = now_ms().saturating_sub(entry.cached_at_ms);
            HttpResponsePayload {
                elapsed_ms: 0,
                from_cache: true,
                cache_age_ms: Some(age_ms),
                ..entry.response
            }
        })
    }

    pub fn insert(&self, key: String, response: HttpResponsePayload) {
        self.inner.insert(
            key,
            CachedEntry {
                response,
                cached_at_ms: now_ms(),
            },
        );
    }

    pub fn clear(&self) {
        self.inner.invalidate_all();
    }

    pub fn len(&self) -> u64 {
        self.inner.entry_count()
    }
}

impl Default for ResponseCache {
    fn default() -> Self {
        Self::new()
    }
}

pub fn cache_key(payload: &HttpRequestPayload) -> String {
    let mut hasher = Sha256::new();

    hasher.update(payload.method.trim().to_uppercase().as_bytes());
    hasher.update(b"|");
    hasher.update(payload.url.trim().as_bytes());
    hasher.update(b"|");

    let mut headers: Vec<_> = payload
        .headers
        .iter()
        .filter(|item| item.enabled && !item.key.trim().is_empty())
        .map(|item| (item.key.trim().to_lowercase(), item.value.clone()))
        .collect();
    headers.sort_by(|a, b| a.0.cmp(&b.0));
    for (key, value) in headers {
        hasher.update(key.as_bytes());
        hasher.update(b"=");
        hasher.update(value.as_bytes());
        hasher.update(b";");
    }

    hasher.update(b"|");

    let mut query: Vec<_> = payload
        .query
        .iter()
        .filter(|item| item.enabled && !item.key.trim().is_empty())
        .map(|item| (item.key.trim().to_lowercase(), item.value.clone()))
        .collect();
    query.sort_by(|a, b| a.0.cmp(&b.0));
    for (key, value) in query {
        hasher.update(key.as_bytes());
        hasher.update(b"=");
        hasher.update(value.as_bytes());
        hasher.update(b";");
    }

    hasher.update(b"|");
    hasher.update(payload.body_kind.as_bytes());
    hasher.update(b"|");
    hasher.update(payload.body.as_bytes());

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

pub fn should_use_cache(payload: &HttpRequestPayload) -> bool {
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

pub fn should_store_in_cache(payload: &HttpRequestPayload, response: &HttpResponsePayload) -> bool {
    if !should_use_cache(payload) {
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
        let key = header.key.to_ascii_lowercase();
        if key != "cache-control" {
            return false;
        }
        let value = header.value.to_ascii_lowercase();
        value.contains("no-store") || value.contains("private")
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}
