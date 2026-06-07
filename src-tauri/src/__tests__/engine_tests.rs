use super::*;

#[test]
fn tracks_completed_and_failed_requests() {
    let engine = RequestEngine::new(4, 5_000);
    engine.begin_request();
    engine.finish_request(true);
    engine.begin_request();
    engine.finish_request(false);

    let stats = engine.stats(2, 3, 7);
    assert_eq!(stats.active_requests, 0);
    assert_eq!(stats.total_completed, 1);
    assert_eq!(stats.total_failed, 1);
    assert_eq!(stats.cache_entries, 5);
    assert_eq!(stats.cache_hits, 7);
}

#[test]
fn clamps_engine_limits() {
    let engine = RequestEngine::new(999, 9_999_999);
    engine.set_limits(0, 100);

    assert_eq!(engine.max_concurrent(), 1);
    assert_eq!(engine.default_timeout_ms(), 1_000);
}

#[test]
fn cancel_all_with_no_handles_returns_zero() {
    let engine = RequestEngine::new(2, 5_000);
    assert_eq!(engine.cancel_all(), 0);
    assert!(!engine.cancel("missing"));
}
