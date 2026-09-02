use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

use pulse_core::{run_collection, CollectionRunInput, CollectionRunResult, HttpRequestPayload};
use tauri::{AppHandle, Emitter};

use crate::http;
use crate::state::HttpState;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CollectionRunProgress {
    index: u32,
    total: u32,
}

pub async fn run_native_collection(
    app: &AppHandle,
    state: &HttpState,
    input: CollectionRunInput,
) -> CollectionRunResult {
    let total = (input.requests.len().max(1) * input.data_rows.len().max(1)) as u32;
    let progress = Arc::new(AtomicU32::new(0));
    let state_send = state.clone();
    let app_send = app.clone();
    let progress_send = progress.clone();
    let state_batch = state.clone();
    let app_batch = app.clone();
    let progress_batch = progress.clone();

    run_collection(
        input,
        move |payload: HttpRequestPayload| {
            let state = state_send.clone();
            let app = app_send.clone();
            let progress = progress_send.clone();
            async move {
                let result = http::execute_request(&state, payload).await;
                emit_progress(&app, &progress, total);
                result
            }
        },
        Some(move |payloads: Vec<HttpRequestPayload>| {
            let state = state_batch.clone();
            let app = app_batch.clone();
            let progress = progress_batch.clone();
            async move {
                let tasks = payloads.into_iter().map(|payload| {
                    let state = state.clone();
                    async move {
                        match http::execute_request(&state, payload).await {
                            Ok(response) => (Some(response), None),
                            Err(error) => (None, Some(error)),
                        }
                    }
                });
                let results = futures_util::future::join_all(tasks).await;
                for _ in 0..results.len() {
                    emit_progress(&app, &progress, total);
                }
                results
            }
        }),
    )
    .await
}

fn emit_progress(app: &AppHandle, progress: &AtomicU32, total: u32) {
    let index = progress.fetch_add(1, Ordering::Relaxed) + 1;
    let _ = app.emit("collection-run-progress", CollectionRunProgress { index, total });
}
