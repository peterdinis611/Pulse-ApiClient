use std::sync::Mutex;

use pulse_core::mock_server::{start_mock_server_with_delay, MockRoute, MockServer, MockServerHandle};
use tauri::State;

#[derive(Default)]
pub struct MockServerState {
    inner: Mutex<Option<MockServer>>,
}

#[tauri::command]
pub async fn mock_server_start(
    state: State<'_, MockServerState>,
    routes: Vec<MockRoute>,
    delay_ms: Option<u64>,
) -> Result<MockServerHandle, String> {
    let server = start_mock_server_with_delay(routes, delay_ms.unwrap_or(0)).await?;
    let handle = server.handle.clone();
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    *guard = Some(server);
    Ok(handle)
}

#[tauri::command]
pub fn mock_server_stop(state: State<'_, MockServerState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    if let Some(mut server) = guard.take() {
        server.stop();
    }
    Ok(())
}
