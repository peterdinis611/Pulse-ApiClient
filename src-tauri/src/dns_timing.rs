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
