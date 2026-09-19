use keyring::Entry;
use serde::Serialize;

const SERVICE: &str = "pulse-api-client";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretValue {
    pub key: String,
    pub value: String,
}

fn entry(key: &str) -> Result<Entry, String> {
    let key = key.trim().strip_prefix("secret.").unwrap_or(key.trim());
    if key.is_empty() || key.contains('/') || key.contains('\0') {
        return Err("Invalid secret key".into());
    }
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
