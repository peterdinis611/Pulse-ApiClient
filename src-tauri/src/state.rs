use crate::cache::ResponseCache;
use reqwest::Client;
use std::time::Duration;

pub struct HttpState {
    pub client: Client,
    pub cache: ResponseCache,
}

impl HttpState {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .pool_max_idle_per_host(16)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .build()
            .map_err(|error| format!("Failed to create HTTP client: {error}"))?;

        Ok(Self {
            client,
            cache: ResponseCache::new(),
        })
    }
}

impl Default for HttpState {
    fn default() -> Self {
        Self::new().expect("HTTP client should initialize")
    }
}
