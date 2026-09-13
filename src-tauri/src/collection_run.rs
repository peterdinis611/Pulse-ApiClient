use pulse_core::{
    run_collection_with_progress, CollectionRunInput, CollectionRunResult, CollectionRunStep,
    HttpRequestPayload,
};
use tauri::{AppHandle, Emitter};

use crate::http;
use crate::state::HttpState;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CollectionRunProgress {
    index: u32,
    total: u32,
    name: String,
    status: Option<u16>,
    elapsed_ms: Option<u64>,
    error: Option<String>,
    passed: Option<u32>,
    failed: Option<u32>,
}

pub async fn run_native_collection(
    app: &AppHandle,
    state: &HttpState,
    input: CollectionRunInput,
) -> CollectionRunResult {
    let state_send = state.clone();
    let state_batch = state.clone();
    let app_progress = app.clone();

    run_collection_with_progress(
        input,
        move |payload: HttpRequestPayload| {
            let state = state_send.clone();
            async move { http::execute_request(&state, payload).await }
        },
        Some(move |payloads: Vec<HttpRequestPayload>| {
            let state = state_batch.clone();
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
                futures_util::future::join_all(tasks).await
            }
        }),
        move |step, index, total| {
            emit_step(&app_progress, step, index, total);
        },
    )
    .await
}

fn emit_step(app: &AppHandle, step: &CollectionRunStep, index: u32, total: u32) {
    let _ = app.emit(
        "collection-run-progress",
        CollectionRunProgress {
            index,
            total,
            name: step.saved.name.clone(),
            status: step.response.as_ref().map(|response| response.status),
            elapsed_ms: step.response.as_ref().map(|response| response.elapsed_ms),
            error: step.error.clone(),
            passed: step.test_results.as_ref().map(|tests| tests.passed),
            failed: step.test_results.as_ref().map(|tests| tests.failed),
        },
    );
}
