use std::collections::HashMap;
use std::sync::Mutex;

use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

#[derive(Debug)]
pub enum WsWriteMessage {
    Text(String),
    Close,
}

pub struct WsConnectionHandle {
    pub tab_id: String,
    pub write_tx: mpsc::UnboundedSender<WsWriteMessage>,
    pub cancel: CancellationToken,
    pub read_task: JoinHandle<()>,
}

pub struct WsState {
    connections: Mutex<HashMap<String, WsConnectionHandle>>,
}

impl WsState {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
        }
    }

    pub fn insert(&self, connection_id: String, handle: WsConnectionHandle) {
        if let Ok(mut connections) = self.connections.lock() {
            connections.insert(connection_id, handle);
        }
    }

    pub fn remove(&self, connection_id: &str) -> Option<WsConnectionHandle> {
        self.connections
            .lock()
            .ok()
            .and_then(|mut connections| connections.remove(connection_id))
    }

    pub fn get_write_tx(&self, connection_id: &str) -> Option<mpsc::UnboundedSender<WsWriteMessage>> {
        self.connections
            .lock()
            .ok()
            .and_then(|connections| connections.get(connection_id).map(|entry| entry.write_tx.clone()))
    }

    pub fn close_connection(&self, connection_id: &str) -> bool {
        let Some(handle) = self.remove(connection_id) else {
            return false;
        };
        handle.cancel.cancel();
        let _ = handle.write_tx.send(WsWriteMessage::Close);
        handle.read_task.abort();
        true
    }

    pub fn close_tab_connections(&self, tab_id: &str) -> u32 {
        let ids: Vec<String> = self
            .connections
            .lock()
            .ok()
            .map(|connections| {
                connections
                    .iter()
                    .filter(|(_, handle)| handle.tab_id == tab_id)
                    .map(|(id, _)| id.clone())
                    .collect()
            })
            .unwrap_or_default();

        ids.iter()
            .map(|id| u32::from(self.close_connection(id)))
            .sum()
    }
}

impl Default for WsState {
    fn default() -> Self {
        Self::new()
    }
}
