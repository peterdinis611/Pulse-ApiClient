//! Thin git CLI wrappers for MCP / Tauri (status, add, commit, diff --stat).

use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub xy: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub dirty: bool,
    pub ahead: i32,
    pub behind: i32,
    pub conflicted: Vec<String>,
    #[serde(default)]
    pub files: Vec<GitFileStatus>,
}

fn validate_root(root: &str) -> Result<&Path, String> {
    let path = Path::new(root.trim());
    if root.trim().is_empty() || root.contains('\0') {
        return Err("Invalid workspace root".into());
    }
    if !path.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }
    Ok(path)
}

pub fn git_status(root: &str) -> Result<GitStatus, String> {
    let dir = validate_root(root)?;
    let output = Command::new("git")
        .args(["-C", &dir.to_string_lossy(), "status", "--porcelain=v1", "-b"])
        .output()
        .map_err(|e| format!("git status failed: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", stderr.trim()));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mut branch = "HEAD".to_string();
    let mut ahead = 0i32;
    let mut behind = 0i32;
    let mut dirty = false;
    let mut conflicted = Vec::new();
    let mut files = Vec::new();
    for (index, line) in text.lines().enumerate() {
        if index == 0 && line.starts_with("## ") {
            let rest = &line[3..];
            let (name, tracking) = rest
                .split_once("...")
                .map(|(a, b)| (a, Some(b)))
                .unwrap_or((rest, None));
            branch = name
                .split_whitespace()
                .next()
                .unwrap_or("HEAD")
                .to_string();
            if let Some(track) = tracking {
                if let Some(start) = track.find('[') {
                    let bracket = &track[start..];
                    if let Some(idx) = bracket.find("ahead ") {
                        let slice = &bracket[idx + 6..];
                        ahead = slice
                            .chars()
                            .take_while(|c| c.is_ascii_digit())
                            .collect::<String>()
                            .parse()
                            .unwrap_or(0);
                    }
                    if let Some(idx) = bracket.find("behind ") {
                        let slice = &bracket[idx + 7..];
                        behind = slice
                            .chars()
                            .take_while(|c| c.is_ascii_digit())
                            .collect::<String>()
                            .parse()
                            .unwrap_or(0);
                    }
                }
            }
            continue;
        }
        if line.len() < 2 {
            continue;
        }
        dirty = true;
        let xy = line[..2].to_string();
        let path = line[3..].trim().to_string();
        if path.is_empty() {
            continue;
        }
        if xy.contains('U') || xy == "AA" || xy == "DD" {
            conflicted.push(path.clone());
        }
        files.push(GitFileStatus { path, xy });
    }
    Ok(GitStatus {
        branch,
        dirty,
        ahead,
        behind,
        conflicted,
        files,
    })
}

pub fn git_add(root: &str, paths: &[String]) -> Result<(), String> {
    let dir = validate_root(root)?;
    if paths.is_empty() {
        return Err("No paths to stage".into());
    }
    for path in paths {
        if path.contains("..") || path.contains('\0') {
            return Err(format!("Invalid path: {path}"));
        }
    }
    let mut args = vec![
        "-C".to_string(),
        dir.to_string_lossy().to_string(),
        "add".to_string(),
        "--".to_string(),
    ];
    args.extend(paths.iter().cloned());
    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| format!("git add failed: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "git add failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

pub fn git_commit(root: &str, message: &str) -> Result<String, String> {
    let dir = validate_root(root)?;
    let message = message.trim();
    if message.is_empty() {
        return Err("Commit message is required".into());
    }
    let output = Command::new("git")
        .args(["-C", &dir.to_string_lossy(), "commit", "-m", message])
        .output()
        .map_err(|e| format!("git commit failed: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "git commit failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn git_diff_stat(root: &str) -> Result<String, String> {
    let dir = validate_root(root)?;
    let output = Command::new("git")
        .args(["-C", &dir.to_string_lossy(), "diff", "--stat", "HEAD"])
        .output()
        .map_err(|e| format!("git diff failed: {e}"))?;
    if !output.status.success() {
        let fallback = Command::new("git")
            .args(["-C", &dir.to_string_lossy(), "status", "--short"])
            .output()
            .map_err(|e| format!("git status failed: {e}"))?;
        return Ok(String::from_utf8_lossy(&fallback.stdout).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_root() {
        assert!(git_status("").is_err());
        assert!(git_add(".", &[]).is_err());
        assert!(git_commit(".", "  ").is_err());
    }
}
