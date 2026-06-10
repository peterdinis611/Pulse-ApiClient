use reqwest::cookie::Jar;
use serde::Serialize;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize)]
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
