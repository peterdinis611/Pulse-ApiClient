use crate::path_params::apply_path_params;
use crate::types::{
    env_pairs, ApiRequestDto, AuthConfig, EnvVariable, HttpRequestPayload, KeyValue, MultipartField,
};
use crate::vars::substitute_variables;

fn map_vars(items: &[EnvVariable], variables: &[EnvVariable]) -> Vec<EnvVariable> {
    items
        .iter()
        .map(|item| EnvVariable {
            id: item.id.clone(),
            key: substitute_variables(&item.key, variables),
            value: substitute_variables(&item.value, variables),
            enabled: item.enabled,
        })
        .collect()
}

pub fn interpolate_request(mut request: ApiRequestDto, variables: &[EnvVariable]) -> ApiRequestDto {
    request.path_params = map_vars(&request.path_params, variables);
    request.url = apply_path_params(&substitute_variables(&request.url, variables), &request.path_params);
    request.headers = map_vars(&request.headers, variables);
    request.query = map_vars(&request.query, variables);
    request.body = substitute_variables(&request.body, variables);
    request.graphql_query = substitute_variables(&request.graphql_query, variables);
    request.graphql_variables = substitute_variables(&request.graphql_variables, variables);
    request.graphql_operation_name = substitute_variables(&request.graphql_operation_name, variables);
    request.form = map_vars(&request.form, variables);
    request.multipart = request
        .multipart
        .into_iter()
        .map(|item| crate::types::RequestMultipartDto {
            key: substitute_variables(&item.key, variables),
            value: substitute_variables(&item.value, variables),
            ..item
        })
        .collect();
    request.auth.bearer_token = substitute_variables(&request.auth.bearer_token, variables);
    request.auth.basic_username = substitute_variables(&request.auth.basic_username, variables);
    request.auth.basic_password = substitute_variables(&request.auth.basic_password, variables);
    request.auth.api_key_key = substitute_variables(&request.auth.api_key_key, variables);
    request.auth.api_key_value = substitute_variables(&request.auth.api_key_value, variables);

    if request.body_kind == "graphql" {
        request.body = build_graphql_body(&request);
    }
    request
}

fn build_graphql_body(request: &ApiRequestDto) -> String {
    let variables_raw = if request.graphql_variables.trim().is_empty() {
        "{}".to_string()
    } else {
        request.graphql_variables.clone()
    };
    let variables = serde_json::from_str::<serde_json::Value>(&variables_raw)
        .unwrap_or_else(|_| serde_json::json!({}));
    let mut payload = serde_json::json!({
        "query": request.graphql_query,
        "variables": variables,
    });
    if !request.graphql_operation_name.trim().is_empty() {
        payload["operationName"] = serde_json::Value::String(request.graphql_operation_name.clone());
    }
    payload.to_string()
}

pub fn to_http_payload(request: &ApiRequestDto, request_id: Option<String>) -> HttpRequestPayload {
    HttpRequestPayload {
        method: request.method.clone(),
        url: request.url.clone(),
        headers: env_pairs(&request.headers),
        query: env_pairs(&request.query),
        body_kind: if request.body_kind.is_empty() {
            "none".into()
        } else {
            request.body_kind.clone()
        },
        body: request.body.clone(),
        form: env_pairs(&request.form),
        multipart: request
            .multipart
            .iter()
            .filter(|item| item.enabled && !item.key.trim().is_empty())
            .map(|item| MultipartField {
                key: item.key.trim().to_string(),
                enabled: true,
                field_type: if item.field_type.is_empty() {
                    "text".into()
                } else {
                    item.field_type.clone()
                },
                value: item.value.clone(),
                file_name: item.file_name.clone(),
                mime_type: item.mime_type.clone(),
            })
            .collect(),
        auth: AuthConfig::from(request.auth.clone()),
        use_cache: Some(false),
        request_id,
        timeout_ms: None,
    }
}

pub fn environment_from_vars(id: &str, name: &str, variables: Vec<EnvVariable>) -> crate::types::EnvironmentDto {
    crate::types::EnvironmentDto {
        id: id.to_string(),
        name: name.to_string(),
        variables,
    }
}

pub fn kv(key: &str, value: &str) -> KeyValue {
    KeyValue {
        key: key.to_string(),
        value: value.to_string(),
        enabled: true,
    }
}
