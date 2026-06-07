use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tokio::task::AbortHandle;

pub const DEFAULT_MAX_CONCURRENT: usize = 32;
pub const DEFAULT_TIMEOUT_MS: u64 = 30_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpEngineStats {
    pub active_requests: u64,
    pub max_concurrent: u64,
    pub cache_entries: u64,
    pub total_completed: u64,
    pub total_failed: u64,
    pub default_timeout_ms: u64,
}

pub struct RequestEngine {
    semaphore: Arc<tokio::sync::Semaphore>,
    max_concurrent: AtomicUsize,
    default_timeout_ms: AtomicU64,
    active_count: Arc<AtomicUsize>,
    total_completed: Arc<AtomicU64>,
    total_failed: Arc<AtomicU64>,
    abort_handles: Mutex<HashMap<String, AbortHandle>>,
}

impl RequestEngine {
    pub fn new(max_concurrent: usize, default_timeout_ms: u64) -> Self {
        let max_concurrent = max_concurrent.clamp(1, 256);
        Self {
            semaphore: Arc::new(tokio::sync::Semaphore::new(max_concurrent)),
            max_concurrent: AtomicUsize::new(max_concurrent),
            default_timeout_ms: AtomicU64::new(default_timeout_ms.clamp(1_000, 600_000)),
            active_count: Arc::new(AtomicUsize::new(0)),
            total_completed: Arc::new(AtomicU64::new(0)),
            total_failed: Arc::new(AtomicU64::new(0)),
            abort_handles: Mutex::new(HashMap::new()),
        }
    }

    pub fn set_limits(&self, max_concurrent: usize, default_timeout_ms: u64) {
        let max_concurrent = max_concurrent.clamp(1, 256);
        self.max_concurrent
            .store(max_concurrent, Ordering::Relaxed);
        self.default_timeout_ms.store(
            default_timeout_ms.clamp(1_000, 600_000),
            Ordering::Relaxed,
        );
    }

    pub fn max_concurrent(&self) -> usize {
        self.max_concurrent.load(Ordering::Relaxed)
    }

    pub fn default_timeout_ms(&self) -> u64 {
        self.default_timeout_ms.load(Ordering::Relaxed)
    }

    pub async fn acquire(&self) -> Result<tokio::sync::SemaphorePermit<'_>, String> {
        self.semaphore
            .acquire()
            .await
            .map_err(|_| "HTTP engine is shutting down".to_string())
    }

    pub fn begin_request(&self) {
        self.active_count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn finish_request(&self, success: bool) {
        self.active_count.fetch_sub(1, Ordering::Relaxed);
        if success {
            self.total_completed.fetch_add(1, Ordering::Relaxed);
        } else {
            self.total_failed.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn register_abort(&self, request_id: String, handle: AbortHandle) {
        if let Ok(mut map) = self.abort_handles.lock() {
            map.insert(request_id, handle);
        }
    }

    pub fn unregister_abort(&self, request_id: &str) {
        if let Ok(mut map) = self.abort_handles.lock() {
            map.remove(request_id);
        }
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let handle = self
            .abort_handles
            .lock()
            .ok()
            .and_then(|mut map| map.remove(request_id));
        if let Some(handle) = handle {
            handle.abort();
            true
        } else {
            false
        }
    }

    pub fn cancel_all(&self) -> u64 {
        let handles = self
            .abort_handles
            .lock()
            .map(|mut map| {
                let values: Vec<AbortHandle> = map.drain().map(|(_, handle)| handle).collect();
                values
            })
            .unwrap_or_default();

        let count = handles.len() as u64;
        for handle in handles {
            handle.abort();
        }
        count
    }

    pub fn stats(&self, cache_entries: u64) -> HttpEngineStats {
        HttpEngineStats {
            active_requests: self.active_count.load(Ordering::Relaxed) as u64,
            max_concurrent: self.max_concurrent.load(Ordering::Relaxed) as u64,
            cache_entries,
            total_completed: self.total_completed.load(Ordering::Relaxed),
            total_failed: self.total_failed.load(Ordering::Relaxed),
            default_timeout_ms: self.default_timeout_ms.load(Ordering::Relaxed),
        }
    }
}
