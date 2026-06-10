use crate::cache::{CacheConfig, ResponseCache};
use crate::cookies::{CookieJarState, StoredCookie};
use crate::db::DbState;
use crate::engine::{RequestEngine, DEFAULT_MAX_CONCURRENT, DEFAULT_TIMEOUT_MS};
use reqwest::Client;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct HttpStateInner {
    client: Mutex<Client>,
    cookies: CookieJarState,
    cache: ResponseCache,
    engine: RequestEngine,
}

#[derive(Clone)]
pub struct HttpState {
    pub inner: Arc<HttpStateInner>,
}

impl HttpState {
    fn build_client(jar: Arc<reqwest::cookie::Jar>) -> Result<Client, String> {
        Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .cookie_provider(jar)
            .pool_max_idle_per_host(32)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|error| format!("Failed to create HTTP client: {error}"))
    }

    pub fn new(max_concurrent: usize, timeout_ms: u64, cache_config: CacheConfig) -> Result<Self, String> {
        let cookies = CookieJarState::new();
        let jar = cookies.jar();
        let client = Self::build_client(jar)?;

        Ok(Self {
            inner: Arc::new(HttpStateInner {
                client: Mutex::new(client),
                cookies,
                cache: ResponseCache::new(cache_config),
                engine: RequestEngine::new(max_concurrent, timeout_ms),
            }),
        })
    }

    pub fn attach_disk_cache(&self, db: Arc<DbState>) {
        self.inner.cache.attach_disk(db);
    }

    pub fn apply_engine_settings(&self, max_concurrent: usize, timeout_ms: u64) {
        self.inner.engine.set_limits(max_concurrent, timeout_ms);
    }

    pub fn apply_cache_settings(&self, config: CacheConfig) {
        self.inner.cache.apply_config(config);
    }

    pub fn client(&self) -> Client {
        self.inner
            .client
            .lock()
            .expect("HTTP client lock poisoned")
            .clone()
    }

    pub fn cache(&self) -> &ResponseCache {
        &self.inner.cache
    }

    pub fn engine(&self) -> &RequestEngine {
        &self.inner.engine
    }

    pub fn record_set_cookies(&self, url: &str, headers: &[(String, String)]) {
        self.inner.cookies.record_set_cookies(url, headers);
    }

    pub fn list_cookies(&self) -> Vec<StoredCookie> {
        self.inner.cookies.list()
    }

    pub fn clear_cookies(&self) -> Result<(), String> {
        let jar = self.inner.cookies.reset();
        let client = Self::build_client(jar)?;
        *self
            .inner
            .client
            .lock()
            .map_err(|error| error.to_string())? = client;
        Ok(())
    }
}

#[cfg(test)]
#[path = "__tests__/state_tests.rs"]
mod state_tests;

impl Default for HttpState {
    fn default() -> Self {
        Self::new(DEFAULT_MAX_CONCURRENT, DEFAULT_TIMEOUT_MS, CacheConfig::default())
            .expect("HTTP client should initialize")
    }
}
