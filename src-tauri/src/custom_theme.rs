use std::fs;
use std::path::Path;

const MAX_CUSTOM_THEME_CSS_BYTES: u64 = 1_048_576;

pub fn read_css_file(path: &str) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("CSS file path is empty".to_string());
    }
    if path.contains('\0') || path.contains("..") {
        return Err("Invalid CSS file path".to_string());
    }

    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err(format!("CSS file not found: {path}"));
    }
    if !file_path.is_file() {
        return Err(format!("Path is not a file: {path}"));
    }

    let extension = file_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("css"))
        .unwrap_or(false);
    if !extension {
        return Err("Custom theme file must use the .css extension".to_string());
    }

    let metadata = fs::metadata(file_path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_CUSTOM_THEME_CSS_BYTES {
        return Err("Custom theme CSS file is too large (max 1 MB)".to_string());
    }

    fs::read_to_string(file_path).map_err(|error| format!("Failed to read CSS file: {error}"))
}

#[cfg(test)]
#[path = "__tests__/custom_theme_tests.rs"]
mod tests;
