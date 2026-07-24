use reqwest::cookie::Jar;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCookie {
    pub name: String,
    pub value: String,
    pub domain: Option<String>,
    pub path: Option<String>,
    pub url: String,
}

pub struct CookieJarState {
    jar: Mutex<Arc<Jar>>,
    log: Mutex<Vec<StoredCookie>>,
}

impl CookieJarState {
    pub fn new() -> Self {
        Self {
            jar: Mutex::new(Arc::new(Jar::default())),
            log: Mutex::new(Vec::new()),
        }
    }

    pub fn jar(&self) -> Arc<Jar> {
        self.jar
            .lock()
            .map(|value| value.clone())
            .unwrap_or_else(|_| Arc::new(Jar::default()))
    }

    pub fn record_set_cookies(&self, url: &str, headers: &[(String, String)]) {
        let Ok(mut log) = self.log.lock() else {
            return;
        };

        for (key, value) in headers {
            if !key.eq_ignore_ascii_case("set-cookie") {
                continue;
            }
            let (name, cookie_value) = parse_set_cookie(value);
            if name.is_empty() {
                continue;
            }
            log.retain(|item| !(item.name == name && item.url == url));
            log.push(StoredCookie {
                name,
                value: cookie_value,
                domain: extract_cookie_attr(value, "domain"),
                path: extract_cookie_attr(value, "path"),
                url: url.to_string(),
            });
        }
    }

    pub fn list(&self) -> Vec<StoredCookie> {
        self.log
            .lock()
            .map(|items| items.clone())
            .unwrap_or_default()
    }

    pub fn upsert(&self, cookie: StoredCookie) -> Result<Vec<StoredCookie>, String> {
        let normalized = normalize_cookie(cookie)?;
        {
            let Ok(mut log) = self.log.lock() else {
                return Err("Cookie log lock poisoned".into());
            };
            log.retain(|item| !(item.name == normalized.name && item.url == normalized.url));
            log.push(normalized);
        }
        self.rebuild_live_jar()?;
        Ok(self.list())
    }

    pub fn remove(&self, name: &str, url: &str) -> Result<Vec<StoredCookie>, String> {
        {
            let Ok(mut log) = self.log.lock() else {
                return Err("Cookie log lock poisoned".into());
            };
            log.retain(|item| !(item.name == name && item.url == url));
        }
        self.rebuild_live_jar()?;
        Ok(self.list())
    }

    pub fn reset(&self) -> Arc<Jar> {
        let jar = Arc::new(Jar::default());
        if let Ok(mut stored) = self.jar.lock() {
            *stored = jar.clone();
        }
        if let Ok(mut log) = self.log.lock() {
            log.clear();
        }
        jar
    }

    fn rebuild_live_jar(&self) -> Result<(), String> {
        let cookies = self.list();
        let jar = build_jar_from_cookies(&cookies)?;
        let Ok(mut stored) = self.jar.lock() else {
            return Err("Cookie jar lock poisoned".into());
        };
        *stored = jar;
        Ok(())
    }
}

fn normalize_cookie(mut cookie: StoredCookie) -> Result<StoredCookie, String> {
    cookie.name = cookie.name.trim().to_string();
    cookie.value = cookie.value.trim().to_string();
    cookie.url = cookie.url.trim().to_string();
    if cookie.name.is_empty() {
        return Err("Cookie name is required".into());
    }
    if cookie.url.is_empty() {
        return Err("Cookie URL is required".into());
    }
    Url::parse(&cookie.url).map_err(|error| format!("Invalid cookie URL: {error}"))?;
    if let Some(domain) = cookie.domain.as_mut() {
        let trimmed = domain.trim().to_string();
        cookie.domain = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
    }
    if let Some(path) = cookie.path.as_mut() {
        let trimmed = path.trim().to_string();
        cookie.path = if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        };
    }
    Ok(cookie)
}

fn cookie_set_header(cookie: &StoredCookie) -> String {
    let mut line = format!("{}={}", cookie.name, cookie.value);
    let path = cookie.path.as_deref().unwrap_or("/");
    line.push_str("; Path=");
    line.push_str(path);
    if let Some(domain) = cookie.domain.as_deref() {
        line.push_str("; Domain=");
        line.push_str(domain);
    }
    line
}

fn build_jar_from_cookies(cookies: &[StoredCookie]) -> Result<Arc<Jar>, String> {
    let jar = Arc::new(Jar::default());
    for cookie in cookies {
        let parsed = Url::parse(&cookie.url).map_err(|error| format!("Invalid cookie URL: {error}"))?;
        jar.add_cookie_str(&cookie_set_header(cookie), &parsed);
    }
    Ok(jar)
}

fn parse_set_cookie(value: &str) -> (String, String) {
    let first = value.split(';').next().unwrap_or(value).trim();
    let Some((name, cookie_value)) = first.split_once('=') else {
        return (String::new(), String::new());
    };
    (name.trim().to_string(), cookie_value.trim().to_string())
}

#[cfg(test)]
#[path = "__tests__/cookies_tests.rs"]
mod cookies_tests;

fn extract_cookie_attr(value: &str, attr: &str) -> Option<String> {
    value
        .split(';')
        .skip(1)
        .map(str::trim)
        .find_map(|part| {
            let (key, val) = part.split_once('=')?;
            if key.eq_ignore_ascii_case(attr) {
                Some(val.trim().to_string())
            } else {
                None
            }
        })
}
