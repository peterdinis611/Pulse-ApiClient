use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

const MAX_COLLECTION_FILE_BYTES: u64 = 4_194_304;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionFolderFile {
    pub name: String,
    pub contents: String,
}

fn validate_dir(path: &str) -> Result<&Path, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Collections folder path is empty".to_string());
    }
    if path.contains('\0') || path.contains("..") {
        return Err("Invalid collections folder path".to_string());
    }
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }
    Ok(dir)
}

fn slug(name: &str) -> String {
    let slug = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>();
    let collapsed = slug
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if collapsed.is_empty() {
        "collection".into()
    } else {
        collapsed
    }
}

pub fn write_collections(dir: &str, files: Vec<(String, String)>) -> Result<Vec<String>, String> {
    let folder = validate_dir(dir)?;
    let mut written = Vec::new();
    for (name, contents) in files {
        let filename = format!("{}.pulse.json", slug(&name));
        let path = folder.join(&filename);
        fs::write(&path, contents).map_err(|error| format!("Failed to write {filename}: {error}"))?;
        written.push(path.to_string_lossy().to_string());
    }
    Ok(written)
}

pub fn write_collection_files(dir: &str, files: Vec<CollectionFolderFile>) -> Result<Vec<String>, String> {
    write_collections(
        dir,
        files
            .into_iter()
            .map(|file| (file.name, file.contents))
            .collect(),
    )
}

pub fn read_collection_files(dir: &str) -> Result<Vec<CollectionFolderFile>, String> {
    Ok(read_collections(dir)?
        .into_iter()
        .map(|(name, contents)| CollectionFolderFile { name, contents })
        .collect())
}

pub fn read_collections(dir: &str) -> Result<Vec<(String, String)>, String> {
    let folder = validate_dir(dir)?;
    let mut files = Vec::new();
    let entries = fs::read_dir(folder).map_err(|error| error.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if !name.ends_with(".pulse.json") && !name.ends_with(".json") {
            continue;
        }
        let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
        if metadata.len() > MAX_COLLECTION_FILE_BYTES {
            return Err(format!("{name} is too large (max 4 MB)"));
        }
        let contents = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        files.push((name.to_string(), contents));
    }
    files.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::{read_collections, slug, write_collections};
    use std::fs;

    #[test]
    fn slug_collapses_punctuation() {
        assert_eq!(slug("Pets / v2"), "pets-v2");
        assert_eq!(slug("   "), "collection");
    }

    #[test]
    fn round_trips_pulse_json_files() {
        let dir = std::env::temp_dir().join(format!(
            "pulse-collections-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let written = write_collections(
            dir.to_str().unwrap(),
            vec![("Pets API".into(), r#"{"info":{"name":"Pets"}}"#.into())],
        )
        .unwrap();
        assert_eq!(written.len(), 1);
        let files = read_collections(dir.to_str().unwrap()).unwrap();
        assert_eq!(files.len(), 1);
        assert!(files[0].0.ends_with(".pulse.json"));
        assert!(files[0].1.contains("Pets"));
        let _ = fs::remove_dir_all(&dir);
    }
}
