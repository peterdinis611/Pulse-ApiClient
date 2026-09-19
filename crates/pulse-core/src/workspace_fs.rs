//! Git-native YAML workspace: one request per file, collections as directories.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::secrets::{is_secret_placeholder, parse_dotenv, strip_secret_values_from_vars};
use crate::types::{
    ApiRequestDto, CollectionDto, EnvVariable, EnvironmentDto, FolderConfigDto, RequestAuthDto, ResponseExampleDto,
    SavedRequestDto,
};

pub const FORMAT_VERSION: u32 = 1;
pub const GITIGNORE: &str = ".env\n*.local.yaml\n.pulse/\n";
pub const ENV_EXAMPLE: &str = "# Copy to .env (gitignored). Reference as {{secret.NAME}}.\n# API_TOKEN=\n";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PulseWorkspaceFile {
    #[serde(default = "default_format")]
    pub version: u32,
    #[serde(default)]
    pub name: String,
}

fn default_format() -> u32 {
    FORMAT_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct YamlCollectionFile {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub folders: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<RequestAuthDto>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variables: Vec<EnvVariable>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pre_request_script: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tests: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub folder_configs: Vec<FolderConfigDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YamlRequestFile {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub protocol: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub url: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub headers: Vec<EnvVariable>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub query: Vec<EnvVariable>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub path_params: Vec<EnvVariable>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub body_kind: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub body: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub graphql_query: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub graphql_variables: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub graphql_operation_name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub form: Vec<EnvVariable>,
    #[serde(default)]
    pub auth: RequestAuthDto,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tests: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub pre_request_script: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub response_schema: String,
    /// Non-secret 2xx snapshot stored in Git for contract checks.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub example: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub examples: Vec<YamlExampleFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct YamlExampleFile {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub status: u16,
    #[serde(default)]
    pub body: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub content_type: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub headers: Vec<YamlHeader>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct YamlHeader {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
}

fn default_method() -> String {
    "GET".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YamlEnvironmentFile {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub variables: Vec<EnvVariable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorkspacePayload {
    pub name: String,
    pub root: String,
    pub collection_groups: Vec<CollectionDto>,
    pub collections: Vec<SavedRequestDto>,
    pub environments: Vec<EnvironmentDto>,
    pub secrets: Vec<EnvVariable>,
}

pub fn slug(name: &str) -> String {
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

fn validate_root(root: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(root.trim());
    if root.trim().is_empty() || root.contains('\0') {
        return Err("Invalid workspace path".into());
    }
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {root}"));
    }
    Ok(path)
}

fn write_yaml<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_yaml::to_string(value).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

fn read_yaml<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_yaml::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

pub fn init_workspace(root: &str, name: &str) -> Result<PathBuf, String> {
    let dir = validate_root(root)?;
    write_yaml(
        &dir.join("pulse.yaml"),
        &PulseWorkspaceFile {
            version: FORMAT_VERSION,
            name: if name.trim().is_empty() {
                "Pulse".into()
            } else {
                name.trim().into()
            },
        },
    )?;
    fs::create_dir_all(dir.join("collections")).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("environments")).map_err(|e| e.to_string())?;
    let gitignore = dir.join(".gitignore");
    if !gitignore.exists() {
        fs::write(&gitignore, GITIGNORE).map_err(|e| e.to_string())?;
    }
    let example = dir.join(".env.example");
    if !example.exists() {
        fs::write(&example, ENV_EXAMPLE).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

pub fn load_dotenv_secrets(root: &Path) -> Vec<EnvVariable> {
    let path = root.join(".env");
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    crate::secrets::dotenv_to_variables(&parse_dotenv(&text))
}

fn sanitize_auth(auth: &mut RequestAuthDto) {
    if !is_secret_placeholder(&auth.bearer_token) && !auth.bearer_token.is_empty() {
        auth.bearer_token = "{{secret.bearerToken}}".into();
    }
    if !is_secret_placeholder(&auth.basic_password) && !auth.basic_password.is_empty() {
        auth.basic_password = "{{secret.basicPassword}}".into();
    }
    if !is_secret_placeholder(&auth.api_key_value) && !auth.api_key_value.is_empty() {
        auth.api_key_value = "{{secret.apiKey}}".into();
    }
}

fn request_to_yaml(request: &ApiRequestDto) -> YamlRequestFile {
    let mut auth = request.auth.clone();
    sanitize_auth(&mut auth);
    YamlRequestFile {
        id: request.id.clone(),
        name: request.name.clone(),
        protocol: request.protocol.clone(),
        method: request.method.clone(),
        url: request.url.clone(),
        headers: request.headers.clone(),
        query: request.query.clone(),
        path_params: request.path_params.clone(),
        body_kind: request.body_kind.clone(),
        body: request.body.clone(),
        graphql_query: request.graphql_query.clone(),
        graphql_variables: request.graphql_variables.clone(),
        graphql_operation_name: request.graphql_operation_name.clone(),
        form: request.form.clone(),
        auth,
        tests: request.tests.clone(),
        pre_request_script: request.pre_request_script.clone(),
        response_schema: request.response_schema.clone(),
        example: default_example_body(&request.examples),
        examples: request
            .examples
            .iter()
            .map(|item| YamlExampleFile {
                name: item.name.clone(),
                status: item.response.status,
                body: item.response.body.clone(),
                content_type: item.response.content_type.clone().unwrap_or_default(),
                headers: item
                    .response
                    .headers
                    .iter()
                    .filter(|header| !header.key.trim().is_empty())
                    .map(|header| YamlHeader {
                        key: header.key.clone(),
                        value: header.value.clone(),
                    })
                    .collect(),
            })
            .collect(),
    }
}

fn default_example_body(examples: &[ResponseExampleDto]) -> String {
    examples
        .iter()
        .find(|item| (200..300).contains(&item.response.status) && !item.response.body.trim().is_empty())
        .or_else(|| examples.iter().find(|item| !item.response.body.trim().is_empty()))
        .map(|item| item.response.body.clone())
        .unwrap_or_default()
}

fn yaml_to_request(file: YamlRequestFile, fallback_id: &str) -> ApiRequestDto {
    ApiRequestDto {
        id: if file.id.trim().is_empty() {
            fallback_id.into()
        } else {
            file.id
        },
        name: file.name,
        protocol: if file.protocol.is_empty() {
            "http".into()
        } else {
            file.protocol
        },
        method: file.method,
        url: file.url,
        headers: file.headers,
        query: file.query,
        path_params: file.path_params,
        body_kind: file.body_kind,
        body: file.body,
        graphql_query: file.graphql_query,
        graphql_variables: file.graphql_variables,
        graphql_operation_name: file.graphql_operation_name,
        form: file.form,
        multipart: vec![],
        auth: file.auth,
        tests: file.tests,
        pre_request_script: file.pre_request_script,
        response_schema: file.response_schema,
        examples: yaml_examples(file.example, file.examples),
    }
}

fn yaml_examples(legacy: String, examples: Vec<YamlExampleFile>) -> Vec<ResponseExampleDto> {
    if !examples.is_empty() {
        return examples
            .into_iter()
            .enumerate()
            .map(|(index, item)| ResponseExampleDto {
                id: format!("ex_{index}"),
                name: if item.name.trim().is_empty() {
                    format!("example-{}", index + 1)
                } else {
                    item.name
                },
                saved_at: String::new(),
                response: crate::types::ExampleResponseDto {
                    status: if item.status == 0 { 200 } else { item.status },
                    status_text: String::new(),
                    headers: item
                        .headers
                        .into_iter()
                        .map(|header| crate::types::ResponseHeader {
                            key: header.key,
                            value: header.value,
                        })
                        .collect(),
                    elapsed_ms: 0,
                    size_bytes: item.body.len(),
                    body: item.body,
                    content_type: if item.content_type.trim().is_empty() {
                        None
                    } else {
                        Some(item.content_type)
                    },
                },
            })
            .collect();
    }
    if legacy.trim().is_empty() {
        return Vec::new();
    }
    vec![ResponseExampleDto {
        id: "ex_ok".into(),
        name: "ok".into(),
        saved_at: String::new(),
        response: crate::types::ExampleResponseDto {
            status: 200,
            status_text: "OK".into(),
            headers: vec![],
            body: legacy,
            content_type: Some("application/json".into()),
            elapsed_ms: 0,
            size_bytes: legacy.len(),
        },
    }]
}

fn walk_request_files(dir: &Path, folder: Option<String>, out: &mut Vec<(Option<String>, PathBuf)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("folder");
            let next = match &folder {
                Some(prefix) => format!("{prefix}/{name}"),
                None => name.to_string(),
            };
            walk_request_files(&path, Some(next), out);
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name == "collection.yaml" || name == "collection.yml" {
            continue;
        }
        if name.ends_with(".pulse.yaml") || name.ends_with(".pulse.yml") {
            out.push((folder.clone(), path));
        }
    }
}

fn id_from_path(root: &Path, path: &Path) -> String {
    let rel = path.strip_prefix(root).unwrap_or(path);
    let raw = rel.to_string_lossy().replace(['/', '\\'], "_");
    format!("req_{}", slug(&raw))
}

pub fn load_workspace(root: &str) -> Result<GitWorkspacePayload, String> {
    let dir = validate_root(root)?;
    let pulse_path = dir.join("pulse.yaml");
    let name = if pulse_path.is_file() {
        read_yaml::<PulseWorkspaceFile>(&pulse_path)?
            .name
            .trim()
            .to_string()
    } else {
        dir.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Pulse")
            .to_string()
    };

    let mut collection_groups = Vec::new();
    let mut collections = Vec::new();
    let collections_root = dir.join("collections");
    if collections_root.is_dir() {
        let mut dirs: Vec<PathBuf> = fs::read_dir(&collections_root)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort();
        for col_dir in dirs {
            let slug_name = col_dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("collection")
                .to_string();
            let meta_path = col_dir.join("collection.yaml");
            let mut meta = if meta_path.is_file() {
                read_yaml::<YamlCollectionFile>(&meta_path)?
            } else {
                YamlCollectionFile {
                    name: slug_name.clone(),
                    ..Default::default()
                }
            };
            strip_secret_values_from_vars(&mut meta.variables);
            if let Some(auth) = meta.auth.as_mut() {
                sanitize_auth(auth);
            }
            let collection_id = if meta.id.trim().is_empty() {
                format!("col_{}", slug(&slug_name))
            } else {
                meta.id.clone()
            };
            let display_name = if meta.name.trim().is_empty() {
                slug_name.clone()
            } else {
                meta.name.clone()
            };
            let mut files = Vec::new();
            walk_request_files(&col_dir, None, &mut files);
            files.sort_by(|a, b| a.1.cmp(&b.1));
            let mut folders = meta.folders.clone();
            for (folder, path) in files {
                if let Some(folder) = folder.clone() {
                    if !folders.contains(&folder) {
                        folders.push(folder);
                    }
                }
                let yaml: YamlRequestFile = read_yaml(&path)?;
                let fallback = id_from_path(&dir, &path);
                let request = yaml_to_request(yaml, &fallback);
                let rel = path
                    .strip_prefix(&dir)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                collections.push(SavedRequestDto {
                    id: request.id.clone(),
                    name: request.name.clone(),
                    collection_id: collection_id.clone(),
                    folder,
                    request,
                    file_path: Some(rel),
                });
            }
            folders.sort();
            collection_groups.push(CollectionDto {
                id: collection_id,
                name: display_name,
                folders,
                auth: meta.auth,
                variables: meta.variables,
                pre_request_script: meta.pre_request_script,
                tests: meta.tests,
                folder_configs: meta.folder_configs,
            });
        }
    }

    let mut environments = Vec::new();
    let env_root = dir.join("environments");
    if env_root.is_dir() {
        let mut files: Vec<PathBuf> = fs::read_dir(&env_root)
            .map_err(|e| e.to_string())?
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| e == "yaml" || e == "yml")
            })
            .collect();
        files.sort();
        for path in files {
            if path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.ends_with(".local.yaml"))
            {
                continue;
            }
            let mut file: YamlEnvironmentFile = read_yaml(&path)?;
            strip_secret_values_from_vars(&mut file.variables);
            let id = if file.id.trim().is_empty() {
                format!("env_{}", slug(&file.name))
            } else {
                file.id
            };
            environments.push(EnvironmentDto {
                id,
                name: file.name,
                variables: file.variables,
            });
        }
    }

    Ok(GitWorkspacePayload {
        name,
        root: dir.to_string_lossy().to_string(),
        collection_groups,
        collections,
        environments,
        secrets: load_dotenv_secrets(&dir),
    })
}

pub fn save_workspace(root: &str, payload: &GitWorkspacePayload) -> Result<(), String> {
    let dir = init_workspace(root, &payload.name)?;
    for group in &payload.collection_groups {
        let col_dir = dir.join("collections").join(slug(&group.name));
        fs::create_dir_all(&col_dir).map_err(|e| e.to_string())?;
        let mut variables = group.variables.clone();
        strip_secret_values_from_vars(&mut variables);
        let mut auth = group.auth.clone();
        if let Some(auth) = auth.as_mut() {
            sanitize_auth(auth);
        }
        write_yaml(
            &col_dir.join("collection.yaml"),
            &YamlCollectionFile {
                id: group.id.clone(),
                name: group.name.clone(),
                folders: group.folders.clone(),
                auth,
                variables,
                pre_request_script: group.pre_request_script.clone(),
                tests: group.tests.clone(),
                folder_configs: group.folder_configs.clone(),
            },
        )?;
        for saved in payload
            .collections
            .iter()
            .filter(|item| item.collection_id == group.id)
        {
            save_saved_request(&dir, group, saved)?;
        }
    }
    for env in &payload.environments {
        let mut variables = env.variables.clone();
        strip_secret_values_from_vars(&mut variables);
        write_yaml(
            &dir.join("environments").join(format!("{}.yaml", slug(&env.name))),
            &YamlEnvironmentFile {
                id: env.id.clone(),
                name: env.name.clone(),
                variables,
            },
        )?;
    }
    Ok(())
}

fn save_saved_request(root: &Path, group: &CollectionDto, saved: &SavedRequestDto) -> Result<String, String> {
    let col_dir = root.join("collections").join(slug(&group.name));
    let file_name = format!("{}.pulse.yaml", slug(&saved.name));
    let path = match &saved.folder {
        Some(folder) if !folder.trim().is_empty() => {
            let mut dir = col_dir.clone();
            for part in folder.split('/') {
                dir.push(slug(part));
            }
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            dir.join(file_name)
        }
        _ => col_dir.join(file_name),
    };
    let yaml = request_to_yaml(&saved.request);
    write_yaml(&path, &yaml)?;
    Ok(path
        .strip_prefix(root)
        .unwrap_or(&path)
        .to_string_lossy()
        .to_string())
}

pub fn save_request(root: &str, saved: &SavedRequestDto, group_name: &str) -> Result<String, String> {
    let dir = validate_root(root)?;
    let group = CollectionDto {
        id: saved.collection_id.clone(),
        name: group_name.into(),
        folders: vec![],
        auth: None,
        variables: vec![],
        pre_request_script: None,
        tests: None,
        folder_configs: vec![],
    };
    save_saved_request(&dir, &group, saved)
}

pub fn request_yaml_text(saved: &SavedRequestDto) -> Result<String, String> {
    serde_yaml::to_string(&request_to_yaml(&saved.request)).map_err(|e| e.to_string())
}

/// Split legacy Pulse collection JSON dumps (`*.pulse.json`) into the YAML tree.
pub fn migrate_pulse_json_dumps(root: &str) -> Result<Vec<String>, String> {
    let dir = validate_root(root)?;
    init_workspace(root, dir.file_name().and_then(|n| n.to_str()).unwrap_or("Pulse"))?;
    let mut migrated = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !name.ends_with(".pulse.json") && !(name.ends_with(".json") && !name.starts_with('.')) {
            continue;
        }
        if name == "pulse.yaml" {
            continue;
        }
        let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if let Some(payload) = collection_json_to_workspace(&text)? {
            save_workspace(root, &payload)?;
            migrated.push(name.to_string());
        }
    }
    Ok(migrated)
}

fn collection_json_to_workspace(raw: &str) -> Result<Option<GitWorkspacePayload>, String> {
    let value: serde_json::Value = match serde_json::from_str(raw) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    let info = value.get("info").cloned().unwrap_or(serde_json::Value::Null);
    let name = info
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let items = value.get("item").and_then(|v| v.as_array());
    if name.is_empty() || items.is_none() {
        return Ok(None);
    }
    let collection_id = format!("col_{}", slug(&name));
    let mut requests = Vec::new();
    let mut folders = Vec::new();
    walk_json_items(items.unwrap(), &collection_id, None, &mut requests, &mut folders);
    folders.sort();
    folders.dedup();
    let group = CollectionDto {
        id: collection_id,
        name,
        folders,
        auth: serde_json::from_value(value.get("auth").cloned().unwrap_or(serde_json::Value::Null)).ok(),
        variables: serde_json::from_value(value.get("variables").cloned().unwrap_or(serde_json::json!([])))
            .unwrap_or_default(),
        pre_request_script: value
            .get("preRequestScript")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        tests: value.get("tests").and_then(|v| v.as_str()).map(|s| s.to_string()),
        folder_configs: serde_json::from_value(
            value.get("folderConfigs").cloned().unwrap_or(serde_json::json!([])),
        )
        .unwrap_or_default(),
    };
    Ok(Some(GitWorkspacePayload {
        name: group.name.clone(),
        root: String::new(),
        collection_groups: vec![group],
        collections: requests,
        environments: vec![],
        secrets: vec![],
    }))
}

fn walk_json_items(
    items: &[serde_json::Value],
    collection_id: &str,
    folder: Option<String>,
    out: &mut Vec<SavedRequestDto>,
    folders: &mut Vec<String>,
) {
    for item in items {
        if let Some(children) = item.get("item").and_then(|v| v.as_array()) {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("folder");
            let next = match &folder {
                Some(prefix) => format!("{prefix}/{name}"),
                None => name.to_string(),
            };
            folders.push(next.clone());
            walk_json_items(children, collection_id, Some(next), out, folders);
            continue;
        }
        let Some(request_value) = item.get("request") else {
            continue;
        };
        let mut request: ApiRequestDto =
            serde_json::from_value(request_value.clone()).unwrap_or_else(|_| ApiRequestDto {
                id: String::new(),
                name: String::new(),
                protocol: "http".into(),
                method: "GET".into(),
                url: String::new(),
                headers: vec![],
                query: vec![],
                body_kind: String::new(),
                body: String::new(),
                graphql_query: String::new(),
                graphql_variables: String::new(),
                graphql_operation_name: String::new(),
                form: vec![],
                multipart: vec![],
                path_params: vec![],
                auth: RequestAuthDto::default(),
                tests: String::new(),
                pre_request_script: String::new(),
                response_schema: String::new(),
                examples: vec![],
            });
        if request.name.is_empty() {
            request.name = item
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Request")
                .to_string();
        }
        if request.id.is_empty() {
            request.id = format!("req_{}", slug(&request.name));
        }
        out.push(SavedRequestDto {
            id: request.id.clone(),
            name: request.name.clone(),
            collection_id: collection_id.into(),
            folder: folder.clone(),
            request,
            file_path: None,
        });
    }
}

pub fn is_mutating_method(method: &str) -> bool {
    matches!(
        method.trim().to_uppercase().as_str(),
        "POST" | "PUT" | "PATCH" | "DELETE"
    )
}

pub fn pending_dir(root: &str) -> PathBuf {
    PathBuf::from(root).join(".pulse").join("pending")
}

pub fn write_pending(root: &str, id: &str, payload: &serde_json::Value) -> Result<String, String> {
    let dir = pending_dir(root);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = if id.trim().is_empty() {
        format!("mut_{}", slug(&payload.to_string()))
    } else {
        slug(id)
    };
    let path = dir.join(format!("{name}.json"));
    fs::write(&path, serde_json::to_string_pretty(payload).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

pub fn list_pending(root: &str) -> Result<Vec<String>, String> {
    let dir = pending_dir(root);
    if !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            out.push(path.to_string_lossy().into_owned());
        }
    }
    out.sort();
    Ok(out)
}

pub fn append_agent_history(root: &str, entry: &serde_json::Value) -> Result<(), String> {
    let dir = PathBuf::from(root).join(".pulse");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("history.jsonl");
    let mut line = serde_json::to_string(entry).unwrap_or_else(|_| "{}".into());
    line.push('\n');
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

pub fn delete_request(root: &str, id: &str) -> Result<String, String> {
    let payload = load_workspace(root)?;
    let needle = id.trim();
    let item = payload
        .collections
        .iter()
        .find(|item| {
            item.id == needle
                || item.name == needle
                || item.file_path.as_deref() == Some(needle)
        })
        .ok_or_else(|| format!("Request not found: {needle}"))?;
    let rel = item
        .file_path
        .clone()
        .ok_or_else(|| "Request has no file path".to_string())?;
    let path = Path::new(root).join(&rel);
    if !path.is_file() {
        return Err(format!("File not found: {}", path.display()));
    }
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(rel)
}

pub fn read_agent_history(root: &str) -> Result<Vec<serde_json::Value>, String> {
    let path = PathBuf::from(root).join(".pulse").join("history.jsonl");
    let Ok(text) = fs::read_to_string(path) else {
        return Ok(Vec::new());
    };
    Ok(text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_yaml_request() {
        let dir = std::env::temp_dir().join(format!(
            "pulse-ws-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let payload = GitWorkspacePayload {
            name: "Demo".into(),
            root: dir.to_string_lossy().to_string(),
            collection_groups: vec![CollectionDto {
                id: "col_demo".into(),
                name: "Pets".into(),
                folders: vec![],
                auth: None,
                variables: vec![EnvVariable {
                    id: "v1".into(),
                    key: "baseUrl".into(),
                    value: "https://api.test".into(),
                    enabled: true,
                    secret: false,
                }],
                pre_request_script: None,
                tests: None,
                folder_configs: vec![],
            }],
            collections: vec![SavedRequestDto {
                id: "req_list".into(),
                name: "List".into(),
                collection_id: "col_demo".into(),
                folder: None,
                file_path: None,
                request: ApiRequestDto {
                    id: "req_list".into(),
                    name: "List".into(),
                    protocol: "http".into(),
                    method: "GET".into(),
                    url: "{{baseUrl}}/pets".into(),
                    headers: vec![],
                    query: vec![],
                    body_kind: "none".into(),
                    body: String::new(),
                    graphql_query: String::new(),
                    graphql_variables: String::new(),
                    graphql_operation_name: String::new(),
                    form: vec![],
                    multipart: vec![],
                    path_params: vec![],
                    auth: RequestAuthDto {
                        auth_type: "bearer".into(),
                        bearer_token: "super-secret".into(),
                        ..Default::default()
                    },
                    tests: String::new(),
                    pre_request_script: String::new(),
                    response_schema: String::new(),
                    examples: vec![
                        ResponseExampleDto {
                            id: "ex_ok".into(),
                            name: "ok".into(),
                            saved_at: String::new(),
                            response: crate::types::ExampleResponseDto {
                                status: 200,
                                status_text: "OK".into(),
                                headers: vec![crate::types::ResponseHeader {
                                    key: "Cache-Control".into(),
                                    value: "no-store".into(),
                                }],
                                body: "{\"ok\":true}".into(),
                                content_type: Some("application/json".into()),
                                elapsed_ms: 0,
                                size_bytes: 11,
                            },
                        },
                        ResponseExampleDto {
                            id: "ex_missing".into(),
                            name: "missing".into(),
                            saved_at: String::new(),
                            response: crate::types::ExampleResponseDto {
                                status: 404,
                                status_text: "Not Found".into(),
                                headers: vec![],
                                body: "{\"error\":\"gone\"}".into(),
                                content_type: Some("application/json".into()),
                                elapsed_ms: 0,
                                size_bytes: 16,
                            },
                        },
                    ],
                },
            }],
            environments: vec![],
            secrets: vec![],
        };
        save_workspace(dir.to_str().unwrap(), &payload).unwrap();
        let loaded = load_workspace(dir.to_str().unwrap()).unwrap();
        assert_eq!(loaded.collection_groups[0].name, "Pets");
        assert_eq!(loaded.collections[0].request.url, "{{baseUrl}}/pets");
        assert_eq!(loaded.collections[0].request.examples.len(), 2);
        assert_eq!(loaded.collections[0].request.examples[1].name, "missing");
        assert_eq!(loaded.collections[0].request.examples[1].response.status, 404);
        assert_eq!(
            loaded.collections[0].request.auth.bearer_token,
            "{{secret.bearerToken}}"
        );
        let yaml = fs::read_to_string(
            dir.join("collections")
                .join("pets")
                .join("list.pulse.yaml"),
        )
        .unwrap();
        assert!(!yaml.contains("super-secret"));
        assert!(yaml.contains("examples:"));
        assert!(yaml.contains("missing"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn migrates_pulse_json() {
        let dir = std::env::temp_dir().join(format!(
            "pulse-mig-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join("pets.pulse.json"),
            r#"{"info":{"name":"Pets","schema":"https://schema.pulse.dev/collection/v1.json"},"item":[{"name":"Health","request":{"method":"GET","url":"https://api.test/health"}}]}"#,
        )
        .unwrap();
        let migrated = migrate_pulse_json_dumps(dir.to_str().unwrap()).unwrap();
        assert_eq!(migrated, vec!["pets.pulse.json"]);
        let loaded = load_workspace(dir.to_str().unwrap()).unwrap();
        assert_eq!(loaded.collections[0].name, "Health");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn deletes_yaml_request_by_id() {
        let dir = std::env::temp_dir().join(format!(
            "pulse-del-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let payload = GitWorkspacePayload {
            name: "Demo".into(),
            root: dir.to_string_lossy().to_string(),
            collection_groups: vec![CollectionDto {
                id: "col_demo".into(),
                name: "Pets".into(),
                folders: vec![],
                auth: None,
                variables: vec![],
                pre_request_script: None,
                tests: None,
                folder_configs: vec![],
            }],
            collections: vec![SavedRequestDto {
                id: "req_list".into(),
                name: "List".into(),
                collection_id: "col_demo".into(),
                folder: None,
                file_path: None,
                request: ApiRequestDto {
                    id: "req_list".into(),
                    name: "List".into(),
                    protocol: "http".into(),
                    method: "GET".into(),
                    url: "https://api.test/pets".into(),
                    headers: vec![],
                    query: vec![],
                    body_kind: "none".into(),
                    body: String::new(),
                    graphql_query: String::new(),
                    graphql_variables: String::new(),
                    graphql_operation_name: String::new(),
                    form: vec![],
                    multipart: vec![],
                    path_params: vec![],
                    auth: RequestAuthDto::default(),
                    tests: String::new(),
                    pre_request_script: String::new(),
                    response_schema: String::new(),
                    examples: vec![],
                },
            }],
            environments: vec![],
            secrets: vec![],
        };
        save_workspace(dir.to_str().unwrap(), &payload).unwrap();
        let rel = delete_request(dir.to_str().unwrap(), "req_list").unwrap();
        assert!(rel.ends_with("list.pulse.yaml"));
        assert!(load_workspace(dir.to_str().unwrap()).unwrap().collections.is_empty());
        let _ = fs::remove_dir_all(&dir);
    }
}
