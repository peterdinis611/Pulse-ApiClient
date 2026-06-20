use super::*;
use std::io::Write;
use std::path::PathBuf;

fn temp_css_file(contents: &str) -> PathBuf {
    let mut path = std::env::temp_dir();
    path.push(format!("pulse-custom-theme-{}.css", std::process::id()));
    let mut file = std::fs::File::create(&path).expect("create temp css");
    write!(file, "{contents}").expect("write temp css");
    path
}

#[test]
fn read_css_file_accepts_valid_file() {
    let path = temp_css_file(":root { --primary: red; }");
    let css = read_css_file(path.to_string_lossy().as_ref()).expect("read css");
    assert!(css.contains("--primary"));
    let _ = std::fs::remove_file(path);
}

#[test]
fn read_css_file_rejects_non_css_extension() {
    let mut path = std::env::temp_dir();
    path.push(format!("pulse-custom-theme-{}.txt", std::process::id()));
    std::fs::write(&path, "body { color: red; }").expect("write temp txt");
    let error = read_css_file(path.to_string_lossy().as_ref()).expect_err("reject txt");
    assert!(error.contains(".css"));
    let _ = std::fs::remove_file(path);
}
