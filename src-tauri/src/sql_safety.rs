pub const MAX_SEARCH_QUERY_LEN: usize = 256;
pub const MAX_RECORD_ID_LEN: usize = 128;
pub const MAX_CACHE_KEY_LEN: usize = 64;
pub const MAX_HTTP_METHOD_LEN: usize = 16;
pub const MAX_BATCH_IDS: usize = 200;

/// Safe primary-key style identifiers: ASCII letters, digits, `_`, `-`.
pub fn is_safe_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_RECORD_ID_LEN
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

pub fn validate_prefixed_id(value: &str, prefix: &str) -> Result<(), String> {
    if !value.starts_with(prefix) {
        return Err(format!("Invalid id: expected prefix '{prefix}'"));
    }
    if !is_safe_identifier(value) {
        return Err("Invalid id format".to_string());
    }
    Ok(())
}

pub fn validate_history_id(id: &str) -> Result<(), String> {
    validate_prefixed_id(id, "hist_")
}

pub fn validate_user_id(user_id: &str) -> Result<(), String> {
    validate_prefixed_id(user_id, "user_")
}

pub fn validate_cache_key(key: &str) -> Result<(), String> {
    if key.is_empty() || key.len() > MAX_CACHE_KEY_LEN {
        return Err("Invalid cache key length".to_string());
    }
    if !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid cache key format".to_string());
    }
    Ok(())
}

pub fn sanitize_fuzzy_query(query: &str) -> Result<String, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    if trimmed.len() > MAX_SEARCH_QUERY_LEN {
        return Err(format!(
            "Search query exceeds {MAX_SEARCH_QUERY_LEN} characters"
        ));
    }
    if trimmed.contains('\0') {
        return Err("Invalid search query".to_string());
    }
    Ok(trimmed.to_string())
}

pub fn validate_http_method(method: &str) -> Result<String, String> {
    let upper = method.trim().to_uppercase();
    if upper.is_empty() || upper.len() > MAX_HTTP_METHOD_LEN {
        return Err("Invalid HTTP method".to_string());
    }
    if !upper
        .bytes()
        .all(|byte| byte.is_ascii_alphabetic())
    {
        return Err("Invalid HTTP method".to_string());
    }
    Ok(upper)
}

pub fn clamp_limit(limit: u32, min: u32, max: u32) -> u32 {
    limit.clamp(min, max)
}

pub fn clamp_offset(offset: u32) -> i64 {
    offset.max(0) as i64
}

pub fn filter_safe_ids<'a>(ids: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    ids.into_iter()
        .filter(|id| is_safe_identifier(id))
        .take(MAX_BATCH_IDS)
        .map(str::to_string)
        .collect()
}

#[cfg(test)]
#[path = "__tests__/sql_safety_tests.rs"]
mod tests;
