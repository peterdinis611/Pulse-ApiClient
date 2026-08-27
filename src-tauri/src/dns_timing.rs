use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Clone, Copy)]
struct DnsHit {
    ms: u64,
    at: Instant,
}

#[derive(Clone, Default)]
pub struct TimingResolver {
    hits: Arc<Mutex<HashMap<String, DnsHit>>>,
}

impl TimingResolver {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn lookup_since(&self, host: &str, started: Instant) -> Option<u64> {
        let guard = self.hits.lock().ok()?;
        let hit = guard.get(host)?;
        if hit.at >= started {
            Some(hit.ms)
        } else {
            None
        }
    }
}

impl Resolve for TimingResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let host = name.as_str().to_string();
        let hits = self.hits.clone();
        Box::pin(async move {
            let started = Instant::now();
            let addrs = tokio::net::lookup_host((host.as_str(), 0))
                .await
                .map_err(|error| Box::new(error) as Box<dyn std::error::Error + Send + Sync>)?;
            let collected: Vec<SocketAddr> = addrs.collect();
            let ms = started.elapsed().as_millis() as u64;
            if let Ok(mut guard) = hits.lock() {
                guard.insert(
                    host,
                    DnsHit {
                        ms,
                        at: Instant::now(),
                    },
                );
            }
            let iterator: Addrs = Box::new(collected.into_iter());
            Ok(iterator)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    impl TimingResolver {
        fn record(&self, host: &str, ms: u64, at: Instant) {
            self.hits.lock().unwrap().insert(host.to_string(), DnsHit { ms, at });
        }
    }

    #[test]
    fn lookup_since_ignores_hits_from_before_the_request() {
        let resolver = TimingResolver::new();
        let started = Instant::now();
        resolver.record("api.example.com", 12, started - Duration::from_millis(5));
        assert_eq!(resolver.lookup_since("api.example.com", started), None);
    }

    #[test]
    fn lookup_since_returns_hits_during_the_request() {
        let resolver = TimingResolver::new();
        let started = Instant::now();
        resolver.record("api.example.com", 18, started + Duration::from_millis(1));
        assert_eq!(resolver.lookup_since("api.example.com", started), Some(18));
        assert_eq!(resolver.lookup_since("other.example.com", started), None);
    }
}
