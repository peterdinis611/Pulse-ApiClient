use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartField {
    #[serde(default)]
    pub key: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub field_type: String,
    #[serde(default)]
    pub value: String,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthConfig {
    #[serde(default)]
    pub auth_type: String,
    pub bearer_token: Option<String>,
    pub basic_username: Option<String>,
    pub basic_password: Option<String>,
    pub api_key_key: Option<String>,
    pub api_key_value: Option<String>,
    pub api_key_in: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestPayload {
    pub method: String,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub query: Vec<KeyValue>,
    pub body_kind: String,
    pub body: String,
    pub form: Vec<KeyValue>,
    pub multipart: Vec<MultipartField>,
    pub auth: AuthConfig,
    #[serde(default)]
    pub use_cache: Option<bool>,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseHeader {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<ResponseHeader>,
    pub body: String,
    #[serde(default = "default_body_encoding")]
    pub body_encoding: String,
    pub elapsed_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dns_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tls_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ttfb_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_ms: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total_ms: Option<u64>,
    pub size_bytes: usize,
    pub content_type: Option<String>,
    #[serde(default)]
    pub from_cache: bool,
    pub cache_age_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

fn default_body_encoding() -> String {
    "utf8".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchItemResult {
    pub response: Option<HttpResponsePayload>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderConfigDto {
    pub path: String,
    pub auth: Option<RequestAuthDto>,
    #[serde(default)]
    pub variables: Vec<EnvVariable>,
    #[serde(default)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    pub tests: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestAuthDto {
    #[serde(default)]
    pub auth_type: String,
    #[serde(default)]
    pub bearer_token: String,
    #[serde(default)]
    pub basic_username: String,
    #[serde(default)]
    pub basic_password: String,
    #[serde(default)]
    pub api_key_key: String,
    #[serde(default)]
    pub api_key_value: String,
    #[serde(default)]
    pub api_key_in: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvVariable {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentDto {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub variables: Vec<EnvVariable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionDto {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub folders: Vec<String>,
    pub auth: Option<RequestAuthDto>,
    #[serde(default)]
    pub variables: Vec<EnvVariable>,
    #[serde(default)]
    pub pre_request_script: Option<String>,
    #[serde(default)]
    pub tests: Option<String>,
    #[serde(default)]
    pub folder_configs: Vec<FolderConfigDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiRequestDto {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub protocol: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub headers: Vec<EnvVariable>,
    #[serde(default)]
    pub query: Vec<EnvVariable>,
    #[serde(default)]
    pub body_kind: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub graphql_query: String,
    #[serde(default)]
    pub graphql_variables: String,
    #[serde(default)]
    pub graphql_operation_name: String,
    #[serde(default)]
    pub form: Vec<EnvVariable>,
    #[serde(default)]
    pub multipart: Vec<RequestMultipartDto>,
    #[serde(default)]
    pub path_params: Vec<EnvVariable>,
    #[serde(default)]
    pub auth: RequestAuthDto,
    #[serde(default)]
    pub tests: String,
    #[serde(default)]
    pub pre_request_script: String,
}

fn default_method() -> String {
    "GET".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestMultipartDto {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub field_type: String,
    pub file_name: Option<String>,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequestDto {
    pub id: String,
    pub name: String,
    pub collection_id: String,
    pub folder: Option<String>,
    pub request: ApiRequestDto,
}

impl From<RequestAuthDto> for AuthConfig {
    fn from(auth: RequestAuthDto) -> Self {
        let auth_type = if auth.auth_type == "inherit" {
            "none".to_string()
        } else {
            auth.auth_type
        };
        Self {
            auth_type,
            bearer_token: Some(auth.bearer_token),
            basic_username: Some(auth.basic_username),
            basic_password: Some(auth.basic_password),
            api_key_key: Some(auth.api_key_key),
            api_key_value: Some(auth.api_key_value),
            api_key_in: Some(auth.api_key_in),
        }
    }
}

pub fn enabled_pairs(items: &[KeyValue]) -> Vec<(String, String)> {
    items
        .iter()
        .filter(|item| item.enabled && !item.key.trim().is_empty())
        .map(|item| (item.key.trim().to_string(), item.value.clone()))
        .collect()
}

pub fn env_pairs(items: &[EnvVariable]) -> Vec<KeyValue> {
    items
        .iter()
        .filter(|item| item.enabled && !item.key.trim().is_empty())
        .map(|item| KeyValue {
            key: item.key.trim().to_string(),
            value: item.value.clone(),
            enabled: true,
        })
        .collect()
}
