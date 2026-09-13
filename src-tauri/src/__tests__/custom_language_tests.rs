use super::*;
use std::path::PathBuf;

fn temp_json_file(contents: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!(
        "pulse-custom-language-{}-{}.json",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos()
    ));
    std::fs::write(&path, contents).expect("write temp json");
    path
}

#[test]
fn read_json_file_accepts_valid_file() {
    let path = temp_json_file(
        r#"{"meta":{"name":"Deutsch","code":"de"},"strings":{"rail.overview":"Uebersicht"}}"#,
    );
    let raw = read_json_file(path.to_string_lossy().as_ref()).expect("read json");
    assert!(raw.contains("rail.overview"));
    let _ = std::fs::remove_file(path);
}

#[test]
fn read_json_file_rejects_non_json_extension() {
    let mut path = std::env::temp_dir();
    path.push(format!("pulse-custom-language-{}.txt", std::process::id()));
    std::fs::write(&path, r#"{"a":"b"}"#).expect("write temp txt");
    let error = read_json_file(path.to_string_lossy().as_ref()).expect_err("reject txt");
    assert!(error.contains(".json"));
    let _ = std::fs::remove_file(path);
}

#[test]
fn read_json_file_rejects_invalid_json() {
    let path = temp_json_file("{not json");
    let error = read_json_file(path.to_string_lossy().as_ref()).expect_err("reject invalid");
    assert!(error.contains("valid JSON"));
    let _ = std::fs::remove_file(path);
}

#[test]
fn read_json_file_rejects_parent_dir() {
    let error = read_json_file("../secret.json").expect_err("reject parent");
    assert!(error.contains("Invalid"));
}
