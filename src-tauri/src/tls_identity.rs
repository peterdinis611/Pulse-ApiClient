use std::fs;
use std::path::Path;

pub fn read_pem_file(path: &str, label: &str) -> Result<Vec<u8>, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err(format!("{label} path is empty"));
    }
    if path.contains('\0') || path.contains("..") {
        return Err(format!("Invalid {label} path"));
    }
    let file_path = Path::new(path);
    if !file_path.is_file() {
        return Err(format!("{label} is not a file: {path}"));
    }
    fs::read(file_path).map_err(|error| format!("Failed to read {label}: {error}"))
}

pub fn identity_pem(cert_path: &str, key_path: Option<&str>) -> Result<Vec<u8>, String> {
    let mut pem = read_pem_file(cert_path, "Client certificate")?;
    if let Some(key) = key_path.filter(|value| !value.trim().is_empty()) {
        pem.push(b'\n');
        pem.extend(read_pem_file(key, "Client key")?);
    }
    Ok(pem)
}

#[cfg(test)]
mod tests {
    use super::read_pem_file;

    #[test]
    fn rejects_parent_segments() {
        let error = read_pem_file("../secret.pem", "Client certificate").unwrap_err();
        assert!(error.contains("Invalid"));
    }

    #[test]
    fn rejects_empty_path() {
        let error = read_pem_file("  ", "Client certificate").unwrap_err();
        assert!(error.contains("empty"));
    }
}
