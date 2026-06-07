use crate::cache::ResponseCache;
use crate::engine::{RequestEngine, DEFAULT_MAX_CONCURRENT, DEFAULT_TIMEOUT_MS};
use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;

pub struct HttpStateInner {
    pub client: Client,
    pub cache: ResponseCache,
    pub engine: RequestEngine,
}

#[derive(Clone)]
pub struct HttpState {
    pub inner: Arc<HttpStateInner>,
}

impl HttpState {
    pub fn new(max_concurrent: usize, timeout_ms: u64) -> Result<Self, String> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .pool_max_idle_per_host(32)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

        Ok(Self {
            inner: Arc::new(HttpStateInner {
                client,
                cache: ResponseCache::new(),
                engine: RequestEngine::new(max_concurrent, timeout_ms),
            }),
        })
    }

    pub fn apply_engine_settings(&self, max_concurrent: usize, timeout_ms: u64) {
        self.inner.engine.set_limits(max_concurrent, timeout_ms);
    }

    pub fn client(&self) -> &Client {
        &self.inner.client
    }

    pub fn cache(&self) -> &ResponseCache {
        &self.inner.cache
    }

    pub fn engine(&self) -> &RequestEngine {
        &self.inner.engine
    }
}

impl Default for HttpState {
    fn default() -> Self {
        Self::new(DEFAULT_MAX_CONCURRENT, DEFAULT_TIMEOUT_MS)
            .expect("HTTP client should initialize")
    }
}
