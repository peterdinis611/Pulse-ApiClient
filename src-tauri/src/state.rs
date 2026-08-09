use crate::cache::{CacheConfig, ResponseCache};
use crate::cookies::{CookieJarState, StoredCookie};
use crate::db::DbState;
use crate::engine::{RequestEngine, DEFAULT_MAX_CONCURRENT, DEFAULT_TIMEOUT_MS};
use crate::settings::{AppSettings, HttpClientConfig};
use reqwest::header::{HeaderMap, HeaderValue, ORIGIN, REFERER, USER_AGENT};
use reqwest::{Client, Proxy};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct HttpStateInner {
    client: Mutex<Client>,
    cookies: CookieJarState,
    cache: ResponseCache,
    engine: RequestEngine,
    store_cookies: AtomicBool,
    last_config: Mutex<HttpClientConfig>,
}

#[derive(Clone)]
pub struct HttpState {
    pub inner: Arc<HttpStateInner>,
}

impl HttpState {
    fn build_client(
        jar: Arc<reqwest::cookie::Jar>,
        config: &HttpClientConfig,
    ) -> Result<Client, String> {
        let mut builder = Client::builder()
            .pool_max_idle_per_host(32)
            .pool_idle_timeout(Duration::from_secs(90))
            .tcp_keepalive(Duration::from_secs(60))
            .connect_timeout(Duration::from_millis(config.connect_timeout_ms))
            .danger_accept_invalid_certs(!config.ssl_verify);

        builder = if config.follow_redirects {
            builder.redirect(reqwest::redirect::Policy::limited(config.max_redirects as usize))
        } else {
            builder.redirect(reqwest::redirect::Policy::none())
        };

        if config.send_cookies {
            builder = builder.cookie_provider(jar);
        }

        if let Some(proxy_url) = config.proxy.as_ref() {
            let proxy = Proxy::all(proxy_url.as_str())
                .map_err(|error| format!("Invalid proxy URL: {error}"))?;
            builder = builder.proxy(proxy);
        }

        let mut defaults = HeaderMap::new();
        if let Some(user_agent) = config.user_agent.as_ref() {
            let value = HeaderValue::from_str(user_agent)
                .map_err(|error| format!("Invalid User-Agent: {error}"))?;
            defaults.insert(USER_AGENT, value);
        }
        if let Some(origin) = config.default_origin.as_ref() {
            let value = HeaderValue::from_str(origin)
                .map_err(|error| format!("Invalid default Origin: {error}"))?;
            defaults.insert(ORIGIN, value);
        }
        if let Some(referer) = config.default_referer.as_ref() {
            let value = HeaderValue::from_str(referer)
                .map_err(|error| format!("Invalid default Referer: {error}"))?;
            defaults.insert(REFERER, value);
        }
        if !defaults.is_empty() {
            builder = builder.default_headers(defaults);
        }

        builder
            .build()
            .map_err(|error| format!("Failed to create HTTP client: {error}"))
    }

    pub fn new(
        max_concurrent: usize,
        timeout_ms: u64,
        cache_config: CacheConfig,
        client_config: HttpClientConfig,
    ) -> Result<Self, String> {
        let cookies = CookieJarState::new();
        let jar = cookies.jar();
        let store_cookies = client_config.store_cookies;
        let client = Self::build_client(jar, &client_config)?;

        Ok(Self {
            inner: Arc::new(HttpStateInner {
                client: Mutex::new(client),
                cookies,
                cache: ResponseCache::new(cache_config),
                engine: RequestEngine::new(max_concurrent, timeout_ms),
                store_cookies: AtomicBool::new(store_cookies),
                last_config: Mutex::new(client_config),
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

    pub fn apply_client_settings(&self, config: HttpClientConfig) -> Result<(), String> {
        self.inner
            .store_cookies
            .store(config.store_cookies, Ordering::Relaxed);
        self.replace_client(self.inner.cookies.jar(), config)
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
        if !self.inner.store_cookies.load(Ordering::Relaxed) {
            return;
        }
        self.inner.cookies.record_set_cookies(url, headers);
    }

    pub fn list_cookies(&self) -> Vec<StoredCookie> {
        self.inner.cookies.list()
    }

    pub fn clear_cookies(&self) -> Result<(), String> {
        let jar = self.inner.cookies.reset();
        let config = self.current_config()?;
        self.replace_client(jar, config)
    }

    pub fn set_cookie(&self, cookie: StoredCookie) -> Result<Vec<StoredCookie>, String> {
        let cookies = self.inner.cookies.upsert(cookie)?;
        let config = self.current_config()?;
        self.replace_client(self.inner.cookies.jar(), config)?;
        Ok(cookies)
    }

    pub fn delete_cookie(&self, name: &str, url: &str) -> Result<Vec<StoredCookie>, String> {
        let cookies = self.inner.cookies.remove(name, url)?;
        let config = self.current_config()?;
        self.replace_client(self.inner.cookies.jar(), config)?;
        Ok(cookies)
    }

    fn current_config(&self) -> Result<HttpClientConfig, String> {
        self.inner
            .last_config
            .lock()
            .map(|guard| guard.clone())
            .map_err(|error| error.to_string())
    }

    fn replace_client(
        &self,
        jar: Arc<reqwest::cookie::Jar>,
        config: HttpClientConfig,
    ) -> Result<(), String> {
        let client = Self::build_client(jar, &config)?;
        *self
            .inner
            .client
            .lock()
            .map_err(|error| error.to_string())? = client;
        *self
            .inner
            .last_config
            .lock()
            .map_err(|error| error.to_string())? = config;
        Ok(())
    }
}

#[cfg(test)]
#[path = "__tests__/state_tests.rs"]
mod state_tests;

impl Default for HttpState {
    fn default() -> Self {
        Self::new(
            DEFAULT_MAX_CONCURRENT,
            DEFAULT_TIMEOUT_MS,
            CacheConfig::default(),
            AppSettings::default().client_config(),
        )
        .expect("HTTP client should initialize")
    }
}
