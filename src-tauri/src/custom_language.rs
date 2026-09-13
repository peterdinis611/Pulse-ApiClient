use std::fs;
use std::path::Path;

const MAX_CUSTOM_LANGUAGE_JSON_BYTES: u64 = 262_144;

pub fn read_json_file(path: &str) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Language file path is empty".to_string());
    }
    if path.contains('\0') || path.contains("..") {
        return Err("Invalid language file path".to_string());
    }

    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(format!("Language file not found: {path}"));
    }
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {path}"));
    }

    let extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if !extension {
        return Err("Custom language file must use the .json extension".to_string());
    }

    let metadata = fs::metadata(file_path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_CUSTOM_LANGUAGE_JSON_BYTES {
        return Err("Custom language JSON file is too large (max 256 KB)".to_string());
    }

    let raw = fs::read_to_string(file_path)
        .map_err(|error| format!("Failed to read language file: {error}"))?;
    serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|error| format!("Language file is not valid JSON: {error}"))?;
    Ok(raw)
}

#[cfg(test)]
#[path = "__tests__/custom_language_tests.rs"]
mod tests;
