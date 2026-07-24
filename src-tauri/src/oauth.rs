use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTokenRequest {
    pub grant_type: String,
    pub token_url: String,
    pub client_id: String,
    #[serde(default)]
    pub client_secret: Option<String>,
    #[serde(default)]
    pub scope: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub redirect_uri: Option<String>,
    #[serde(default)]
    pub code_verifier: Option<String>,
    #[serde(default)]
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub token_type: Option<String>,
    #[serde(default)]
    pub expires_in: Option<u64>,
    #[serde(default)]
    pub scope: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TokenEndpointBody {
    access_token: Option<String>,
    refresh_token: Option<String>,
    token_type: Option<String>,
    expires_in: Option<u64>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

pub async fn exchange_oauth_token(request: OAuthTokenRequest) -> Result<OAuthTokenResponse, String> {
    let token_url = request.token_url.trim();
    if token_url.is_empty() {
        return Err("OAuth token URL is required".into());
    }
    let client_id = request.client_id.trim();
    if client_id.is_empty() {
        return Err("OAuth client id is required".into());
    }

    let grant = request.grant_type.trim().to_ascii_lowercase();
    let mut form: HashMap<&str, String> = HashMap::new();
    form.insert("grant_type", grant.clone());
    form.insert("client_id", client_id.to_string());

    if let Some(secret) = request.client_secret.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        form.insert("client_secret", secret.to_string());
    }
    if let Some(scope) = request.scope.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        form.insert("scope", scope.to_string());
    }

    match grant.as_str() {
        "client_credentials" => {}
        "authorization_code" => {
            let code = request
                .code
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .ok_or_else(|| "Authorization code is required".to_string())?;
            form.insert("code", code.to_string());
            if let Some(redirect) = request
                .redirect_uri
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
            {
                form.insert("redirect_uri", redirect.to_string());
            }
            if let Some(verifier) = request
                .code_verifier
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
            {
                form.insert("code_verifier", verifier.to_string());
            }
        }
        "refresh_token" => {
            let refresh = request
                .refresh_token
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .ok_or_else(|| "Refresh token is required".to_string())?;
            form.insert("refresh_token", refresh.to_string());
        }
        other => return Err(format!("Unsupported OAuth grant type: {other}")),
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Failed to create OAuth client: {error}"))?;

    let response = client
        .post(token_url)
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await
        .map_err(|error| format!("OAuth token request failed: {error}"))?;

    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|error| format!("Failed to read OAuth token response: {error}"))?;

    let parsed: TokenEndpointBody = serde_json::from_str(&body_text).unwrap_or(TokenEndpointBody {
        access_token: None,
        refresh_token: None,
        token_type: None,
        expires_in: None,
        scope: None,
        error: None,
        error_description: None,
    });

    if !status.is_success() {
        let detail = parsed
            .error_description
            .or(parsed.error)
            .unwrap_or(body_text);
        return Err(format!("OAuth token endpoint returned {status}: {detail}"));
    }

    let access_token = parsed
        .access_token
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(|| "OAuth token response missing access_token".to_string())?;

    Ok(OAuthTokenResponse {
        access_token,
        refresh_token: parsed.refresh_token,
        token_type: parsed.token_type,
        expires_in: parsed.expires_in,
        scope: parsed.scope,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rejects_empty_token_url() {
        let err = exchange_oauth_token(OAuthTokenRequest {
            grant_type: "client_credentials".into(),
            token_url: " ".into(),
            client_id: "id".into(),
            client_secret: None,
            scope: None,
            code: None,
            redirect_uri: None,
            code_verifier: None,
            refresh_token: None,
        })
        .await
        .unwrap_err();
        assert!(err.contains("token URL"));
    }
}
