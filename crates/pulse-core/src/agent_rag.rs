//! Lightweight RAG over request/agent history — hashed n-gram + TF-IDF cosine.
//! Hybrid filters (`method:POST status:500`) and incremental upserts; no PyTorch.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::agent_memory::list_facts;
use crate::workspace_fs::read_agent_history;

const EMBED_DIM: usize = 256;
const NGRAM_MIN: usize = 3;
const NGRAM_MAX: usize = 5;
const BODY_SNIPPET_CHARS: usize = 280;
const DEFAULT_PRUNE_4XX_DAYS: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RagDocument {
    pub id: String,
    pub kind: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagHit {
    pub id: String,
    pub kind: String,
    pub text: String,
    pub score: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<Value>,
}

#[derive(Debug, Clone, Default)]
pub struct HybridFilters {
    pub method: Option<String>,
    pub status: Option<String>,
    pub status_class: Option<String>,
    pub env: Option<String>,
    pub kind: Option<String>,
    pub free_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RagIndexFile {
    version: u32,
    updated_at: String,
    embedding_runtime: String,
    docs: Vec<RagDocument>,
}

impl Default for RagIndexFile {
    fn default() -> Self {
        Self {
            version: 1,
            updated_at: now_iso(),
            embedding_runtime: "tfidf-ngram-v1".into(),
            docs: Vec::new(),
        }
    }
}

fn now_iso() -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let secs = millis / 1000;
    let ms = millis % 1000;
    format!("{secs}.{ms:03}Z")
}

pub fn rag_index_path(root: &str) -> PathBuf {
    PathBuf::from(root).join(".pulse").join("rag-index.json")
}

fn snippet(text: &str, max: usize) -> String {
    let trimmed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.chars().count() <= max {
        return trimmed;
    }
    trimmed.chars().take(max).collect::<String>() + "…"
}

fn extract_graphql_operation(body: &str) -> Option<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(Value::Object(map)) = serde_json::from_str::<Value>(trimmed) {
        if let Some(name) = map.get("operationName").and_then(|v| v.as_str()) {
            if !name.is_empty() {
                return Some(name.to_string());
            }
        }
        if let Some(query) = map.get("query").and_then(|v| v.as_str()) {
            return extract_graphql_operation(query);
        }
    }
    for line in trimmed.lines() {
        let line = line.trim();
        for prefix in ["query ", "mutation ", "subscription "] {
            if let Some(rest) = line.strip_prefix(prefix).or_else(|| {
                line.strip_prefix(&prefix.to_ascii_uppercase())
            }) {
                let name = rest
                    .split(|c: char| c == '(' || c == '{' || c.is_whitespace())
                    .next()
                    .unwrap_or("")
                    .trim();
                if !name.is_empty() && name != "{" {
                    return Some(name.to_string());
                }
            }
        }
    }
    None
}

/// Tokenize + character n-grams for short API history lines.
pub fn tokenize(text: &str) -> Vec<String> {
    let lower = text.to_ascii_lowercase();
    let mut tokens = Vec::new();
    let mut current = String::new();
    for ch in lower.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.' {
            current.push(ch);
        } else if !current.is_empty() {
            push_token_and_ngrams(&mut tokens, &current);
            current.clear();
        }
    }
    if !current.is_empty() {
        push_token_and_ngrams(&mut tokens, &current);
    }
    tokens
}

fn push_token_and_ngrams(out: &mut Vec<String>, token: &str) {
    if token.len() < 2 {
        return;
    }
    out.push(token.to_string());
    for part in token.split(|c| c == '.' || c == '-' || c == '_') {
        if part.len() >= 2 && part != token {
            out.push(part.to_string());
        }
    }
    let chars: Vec<char> = token.chars().collect();
    if chars.len() >= NGRAM_MIN {
        for n in NGRAM_MIN..=NGRAM_MAX.min(chars.len()) {
            for window in chars.windows(n) {
                out.push(window.iter().collect());
            }
        }
    }
}

fn hash_token(token: &str) -> usize {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in token.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    (hash as usize) % EMBED_DIM
}

pub fn embed_tokens(tokens: &[String]) -> Vec<f32> {
    let mut vec = vec![0f32; EMBED_DIM];
    if tokens.is_empty() {
        return vec;
    }
    let mut tf: HashMap<String, f32> = HashMap::new();
    for token in tokens {
        *tf.entry(token.clone()).or_insert(0.0) += 1.0;
    }
    let len = tokens.len() as f32;
    for (token, count) in tf {
        let bucket = hash_token(&token);
        vec[bucket] += (1.0 + count.ln()) / (1.0 + len.ln());
    }
    l2_normalize(&mut vec);
    vec
}

pub fn embed_text(text: &str) -> Vec<f32> {
    embed_tokens(&tokenize(text))
}

fn l2_normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 1e-9 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

/// Parse `method:POST status:500 env:staging free text` hybrid filters.
pub fn parse_hybrid_query(raw: &str) -> HybridFilters {
    let mut filters = HybridFilters::default();
    let mut free = Vec::new();
    for token in raw.split_whitespace() {
        if let Some((key, value)) = token.split_once(':') {
            let key = key.to_ascii_lowercase();
            let value = value.trim().to_string();
            if value.is_empty() {
                free.push(token.to_string());
                continue;
            }
            match key.as_str() {
                "method" | "m" => filters.method = Some(value.to_ascii_uppercase()),
                "status" | "s" => {
                    if matches!(value.as_str(), "2xx" | "3xx" | "4xx" | "5xx") {
                        filters.status_class = Some(value.to_ascii_lowercase());
                    } else {
                        filters.status = Some(value);
                    }
                }
                "env" | "environment" => filters.env = Some(value.to_ascii_lowercase()),
                "kind" | "type" => filters.kind = Some(value.to_ascii_lowercase()),
                _ => free.push(token.to_string()),
            }
        } else {
            free.push(token.to_string());
        }
    }
    filters.free_text = free.join(" ");
    filters
}

fn meta_str(meta: &Option<Value>, pointers: &[&str]) -> String {
    let Some(meta) = meta else {
        return String::new();
    };
    for pointer in pointers {
        if let Some(v) = meta.pointer(pointer).and_then(|x| x.as_str()) {
            if !v.is_empty() {
                return v.to_string();
            }
        }
        if let Some(v) = meta.get(pointer.trim_start_matches('/')) {
            if let Some(s) = v.as_str() {
                if !s.is_empty() {
                    return s.to_string();
                }
            }
            if let Some(n) = v.as_i64() {
                return n.to_string();
            }
            if let Some(n) = v.as_u64() {
                return n.to_string();
            }
        }
    }
    String::new()
}

fn status_matches(status: &str, exact: Option<&str>, class: Option<&str>) -> bool {
    if let Some(exact) = exact {
        if status != exact {
            return false;
        }
    }
    if let Some(class) = class {
        let Ok(code) = status.parse::<u16>() else {
            return false;
        };
        let ok = match class {
            "2xx" => (200..300).contains(&code),
            "3xx" => (300..400).contains(&code),
            "4xx" => (400..500).contains(&code),
            "5xx" => (500..600).contains(&code),
            _ => true,
        };
        if !ok {
            return false;
        }
    }
    true
}

fn doc_matches_filters(doc: &RagDocument, filters: &HybridFilters) -> bool {
    if let Some(kind) = filters.kind.as_deref() {
        if !doc.kind.eq_ignore_ascii_case(kind) {
            return false;
        }
    }
    let text_l = doc.text.to_ascii_lowercase();
    if let Some(method) = filters.method.as_deref() {
        let m = method.to_ascii_uppercase();
        let from_meta = meta_str(&doc.meta, &["/method", "/request/method"]);
        if !from_meta.is_empty() {
            if !from_meta.eq_ignore_ascii_case(&m) {
                return false;
            }
        } else if !doc.text.to_ascii_uppercase().contains(&m) {
            return false;
        }
    }
    let status = meta_str(
        &doc.meta,
        &["/status", "/response/status"],
    );
    let status = if status.is_empty() {
        // fall back to bare status token in text
        doc.text
            .split_whitespace()
            .find(|t| t.chars().all(|c| c.is_ascii_digit()) && t.len() == 3)
            .unwrap_or("")
            .to_string()
    } else {
        status
    };
    if !status_matches(
        &status,
        filters.status.as_deref(),
        filters.status_class.as_deref(),
    ) {
        return false;
    }
    if let Some(env) = filters.env.as_deref() {
        let env_l = env.to_ascii_lowercase();
        let in_meta = meta_str(&doc.meta, &["/env", "/environment", "/request/environment"]);
        if !in_meta.to_ascii_lowercase().contains(&env_l) && !text_l.contains(&env_l) {
            return false;
        }
    }
    true
}

fn search_tfidf(docs: &[RagDocument], query: &str, limit: usize) -> Vec<RagHit> {
    let query_tokens = tokenize(query);
    if docs.is_empty() {
        return Vec::new();
    }
    // Filter-only query (e.g. `method:POST status:500`) — rank by recency proxy in text.
    if query_tokens.is_empty() {
        return docs
            .iter()
            .take(limit.max(1))
            .map(|doc| RagHit {
                id: doc.id.clone(),
                kind: doc.kind.clone(),
                text: doc.text.clone(),
                score: 1.0,
                meta: doc.meta.clone(),
            })
            .collect();
    }

    let doc_tokens: Vec<Vec<String>> = docs.iter().map(|d| tokenize(&d.text)).collect();
    let n = docs.len() as f32;

    let mut df: HashMap<String, f32> = HashMap::new();
    for tokens in &doc_tokens {
        let unique: HashSet<&String> = tokens.iter().collect();
        for token in unique {
            *df.entry(token.clone()).or_insert(0.0) += 1.0;
        }
    }

    let idf = |token: &str| -> f32 {
        let d = df.get(token).copied().unwrap_or(0.0);
        ((n + 1.0) / (d + 1.0)).ln() + 1.0
    };

    let weighted_embed = |tokens: &[String]| -> Vec<f32> {
        let mut vec = vec![0f32; EMBED_DIM];
        let mut tf: HashMap<String, f32> = HashMap::new();
        for token in tokens {
            *tf.entry(token.clone()).or_insert(0.0) += 1.0;
        }
        for (token, count) in tf {
            let w = (1.0 + count.ln()) * idf(&token);
            vec[hash_token(&token)] += w;
        }
        l2_normalize(&mut vec);
        vec
    };

    let q_vec = weighted_embed(&query_tokens);
    let mut scored: Vec<(usize, f32)> = doc_tokens
        .iter()
        .enumerate()
        .map(|(i, tokens)| (i, cosine(&q_vec, &weighted_embed(tokens))))
        .filter(|(_, score)| *score > 0.02)
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    scored
        .into_iter()
        .take(limit.max(1))
        .map(|(i, score)| {
            let doc = &docs[i];
            RagHit {
                id: doc.id.clone(),
                kind: doc.kind.clone(),
                text: doc.text.clone(),
                score,
                meta: doc.meta.clone(),
            }
        })
        .collect()
}

pub fn search_documents(docs: &[RagDocument], query: &str, limit: usize) -> Vec<RagHit> {
    let filters = parse_hybrid_query(query);
    let filtered: Vec<RagDocument> = docs
        .iter()
        .filter(|doc| doc_matches_filters(doc, &filters))
        .cloned()
        .collect();
    let q = if filters.free_text.trim().is_empty() {
        // Keep filter tokens out of TF-IDF when only filters were provided.
        String::new()
    } else {
        filters.free_text.clone()
    };
    search_tfidf(&filtered, &q, limit)
}

fn collect_text_parts(parts: &[String]) -> String {
    parts
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn test_fail_snippet(entry: &Value) -> String {
    if let Some(arr) = entry.pointer("/testResults/results").and_then(|v| v.as_array()) {
        let fails: Vec<String> = arr
            .iter()
            .filter(|item| item.get("passed").and_then(|p| p.as_bool()) == Some(false))
            .filter_map(|item| {
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("test");
                let msg = item.get("message").and_then(|v| v.as_str()).unwrap_or("");
                Some(format!("{name} {msg}"))
            })
            .take(3)
            .collect();
        if !fails.is_empty() {
            return format!("test_fail {}", fails.join(" "));
        }
    }
    if let Some(failed) = entry.get("failed").and_then(|v| v.as_u64()) {
        if failed > 0 {
            return format!("test_fail count:{failed}");
        }
    }
    String::new()
}

pub fn doc_from_history_entry(entry: &Value) -> Option<RagDocument> {
    let id = entry
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if id.is_empty() {
        return None;
    }
    let source = entry
        .get("source")
        .and_then(|v| v.as_str())
        .unwrap_or("agent");
    let kind_field = entry.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    let method = entry
        .pointer("/request/method")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let url = entry
        .pointer("/request/url")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let name = entry
        .pointer("/request/name")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let req_body = entry
        .pointer("/request/body")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let body_kind = entry
        .pointer("/request/bodyKind")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let status = entry
        .pointer("/response/status")
        .and_then(|v| v.as_u64().or_else(|| v.as_i64().map(|n| n as u64)))
        .map(|s| s.to_string())
        .unwrap_or_default();
    let resp_body = entry
        .pointer("/response/body")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let sent_at = entry.get("sentAt").and_then(|v| v.as_str()).unwrap_or("");
    let gql_op = extract_graphql_operation(req_body)
        .or_else(|| {
            if body_kind.eq_ignore_ascii_case("graphql") {
                extract_graphql_operation(req_body)
            } else {
                None
            }
        })
        .unwrap_or_default();
    let fail = test_fail_snippet(entry);

    let text = collect_text_parts(&[
        source.to_string(),
        kind_field.to_string(),
        method.to_string(),
        name.to_string(),
        url.to_string(),
        status.clone(),
        if gql_op.is_empty() {
            String::new()
        } else {
            format!("graphql {gql_op}")
        },
        snippet(req_body, BODY_SNIPPET_CHARS),
        snippet(resp_body, BODY_SNIPPET_CHARS),
        fail,
        sent_at.to_string(),
    ]);

    if text.trim().is_empty() {
        return None;
    }

    Some(RagDocument {
        id: format!("hist:{id}"),
        kind: "history".into(),
        text,
        meta: Some(entry.clone()),
    })
}

pub fn docs_from_agent_history(root: &str) -> Vec<RagDocument> {
    read_agent_history(root)
        .unwrap_or_default()
        .iter()
        .filter_map(doc_from_history_entry)
        .collect()
}

pub fn docs_from_memory_facts(root: &str) -> Vec<RagDocument> {
    list_facts(root, None)
        .unwrap_or_default()
        .into_iter()
        .map(|fact| {
            let text = format!(
                "fact {} {} {} {}",
                fact.key,
                fact.value,
                fact.tags.join(" "),
                fact.note.as_deref().unwrap_or("")
            );
            RagDocument {
                id: format!("fact:{}", fact.id),
                kind: "fact".into(),
                text,
                meta: serde_json::to_value(&fact).ok(),
            }
        })
        .collect()
}

pub fn docs_from_request_rows(
    rows: &[(String, String, String, String, String, Option<i64>)],
) -> Vec<RagDocument> {
    rows.iter()
        .map(|(id, sent_at, method, name, url, status)| {
            let status_s = status.map(|s| s.to_string()).unwrap_or_default();
            let text = format!("{method} {name} {url} {status_s} {sent_at}");
            RagDocument {
                id: format!("req:{id}"),
                kind: "request".into(),
                text,
                meta: Some(serde_json::json!({
                    "id": id,
                    "sentAt": sent_at,
                    "method": method,
                    "name": name,
                    "url": url,
                    "status": status,
                })),
            }
        })
        .collect()
}

/// Build a rich request doc from SQLite history columns + request JSON.
pub fn doc_from_request_history(
    id: &str,
    sent_at: &str,
    method: &str,
    name: &str,
    url: &str,
    status: Option<i64>,
    request_json: &str,
) -> RagDocument {
    let status_s = status.map(|s| s.to_string()).unwrap_or_default();
    let mut parts = vec![
        method.to_string(),
        name.to_string(),
        url.to_string(),
        status_s.clone(),
        sent_at.to_string(),
    ];
    let mut meta = serde_json::json!({
        "id": id,
        "sentAt": sent_at,
        "method": method,
        "name": name,
        "url": url,
        "status": status,
    });
    if let Ok(req) = serde_json::from_str::<Value>(request_json) {
        let body = req.get("body").and_then(|v| v.as_str()).unwrap_or("");
        let body_kind = req.get("bodyKind").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(op) = extract_graphql_operation(body) {
            parts.push(format!("graphql {op}"));
            meta["graphqlOperation"] = Value::String(op);
        } else if body_kind.eq_ignore_ascii_case("graphql") && !body.is_empty() {
            parts.push("graphql".into());
        }
        let snip = snippet(body, BODY_SNIPPET_CHARS);
        if !snip.is_empty() {
            parts.push(snip);
        }
        meta["request"] = req;
    }
    RagDocument {
        id: format!("req:{id}"),
        kind: "request".into(),
        text: collect_text_parts(&parts),
        meta: Some(meta),
    }
}

fn load_index_file(path: &Path) -> Result<RagIndexFile, String> {
    if !path.is_file() {
        return Ok(RagIndexFile::default());
    }
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if text.trim().is_empty() {
        return Ok(RagIndexFile::default());
    }
    serde_json::from_str(&text).map_err(|e| format!("Invalid RAG index: {e}"))
}

fn save_index_file(path: &Path, file: &RagIndexFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

/// Rebuild workspace RAG index from agent history + structured facts (+ optional extra docs).
pub fn rebuild_rag_index(root: &str, extra_docs: &[RagDocument]) -> Result<usize, String> {
    let mut docs = docs_from_agent_history(root);
    docs.extend(docs_from_memory_facts(root));
    docs.extend(extra_docs.iter().cloned());

    let mut by_id: HashMap<String, RagDocument> = HashMap::new();
    for doc in docs {
        by_id.insert(doc.id.clone(), doc);
    }
    let docs: Vec<_> = by_id.into_values().collect();
    let count = docs.len();

    let file = RagIndexFile {
        version: 1,
        updated_at: now_iso(),
        embedding_runtime: "tfidf-ngram-v1".into(),
        docs,
    };
    save_index_file(&rag_index_path(root), &file)?;
    Ok(count)
}

/// Merge docs into the existing index by id (later wins). Creates the file if missing.
pub fn upsert_rag_docs(root: &str, docs: &[RagDocument]) -> Result<usize, String> {
    if docs.is_empty() {
        return Ok(load_index_file(&rag_index_path(root))?.docs.len());
    }
    let path = rag_index_path(root);
    let mut file = load_index_file(&path)?;
    let mut by_id: HashMap<String, RagDocument> = file
        .docs
        .drain(..)
        .map(|doc| (doc.id.clone(), doc))
        .collect();
    for doc in docs {
        if doc.id.is_empty() {
            continue;
        }
        by_id.insert(doc.id.clone(), doc.clone());
    }
    file.docs = by_id.into_values().collect();
    file.updated_at = now_iso();
    file.embedding_runtime = "tfidf-ngram-v1".into();
    let count = file.docs.len();
    save_index_file(&path, &file)?;
    Ok(count)
}

pub fn upsert_rag_document(root: &str, doc: RagDocument) -> Result<usize, String> {
    upsert_rag_docs(root, &[doc])
}

pub fn remove_rag_docs(root: &str, ids: &[String]) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(load_index_file(&rag_index_path(root))?.docs.len());
    }
    let path = rag_index_path(root);
    let mut file = load_index_file(&path)?;
    let remove: HashSet<&String> = ids.iter().collect();
    file.docs.retain(|doc| !remove.contains(&doc.id));
    file.updated_at = now_iso();
    let count = file.docs.len();
    save_index_file(&path, &file)?;
    Ok(count)
}

/// Drop stale 4xx request/history noise (and optionally cap index size).
pub fn prune_rag_index(
    root: &str,
    older_than_days: Option<u64>,
    max_docs: Option<usize>,
) -> Result<usize, String> {
    let path = rag_index_path(root);
    let mut file = load_index_file(&path)?;
    let days = older_than_days.unwrap_or(DEFAULT_PRUNE_4XX_DAYS);
    let cutoff_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().saturating_sub(days.saturating_mul(86_400)))
        .unwrap_or(0);

    file.docs.retain(|doc| {
        if doc.kind != "request" && doc.kind != "history" {
            return true;
        }
        let status = meta_str(&doc.meta, &["/status", "/response/status"]);
        let Ok(code) = status.parse::<u16>() else {
            return true;
        };
        if !(400..500).contains(&code) {
            return true;
        }
        let sent = meta_str(&doc.meta, &["/sentAt", "/sent_at"]);
        let secs = parse_approx_epoch_secs(&sent);
        if secs == 0 {
            return true;
        }
        secs >= cutoff_secs
    });

    if let Some(max) = max_docs {
        if file.docs.len() > max {
            file.docs.sort_by(|a, b| {
                let sa = meta_str(&a.meta, &["/sentAt", "/updatedAt", "/updated_at"]);
                let sb = meta_str(&b.meta, &["/sentAt", "/updatedAt", "/updated_at"]);
                sb.cmp(&sa)
            });
            file.docs.truncate(max);
        }
    }

    file.updated_at = now_iso();
    let count = file.docs.len();
    save_index_file(&path, &file)?;
    Ok(count)
}

fn parse_approx_epoch_secs(raw: &str) -> u64 {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return 0;
    }
    // `secs.msZ` from our writers, or RFC3339 prefix `YYYY-MM-DD…`
    if let Some(head) = trimmed.split('.').next() {
        if let Ok(secs) = head.parse::<u64>() {
            if secs > 1_000_000_000 {
                return secs;
            }
        }
    }
    if trimmed.len() >= 10 && &trimmed[4..5] == "-" {
        // Rough day → epoch via datediff from a fixed epoch is heavy; keep 4xx if unparsable.
        return 0;
    }
    0
}

pub fn load_rag_docs(root: &str) -> Result<Vec<RagDocument>, String> {
    Ok(load_index_file(&rag_index_path(root))?.docs)
}

pub fn search_rag(root: &str, query: &str, limit: usize) -> Result<Vec<RagHit>, String> {
    let path = rag_index_path(root);
    let mut file = load_index_file(&path)?;
    if file.docs.is_empty() {
        rebuild_rag_index(root, &[])?;
        file = load_index_file(&path)?;
    }
    Ok(search_documents(&file.docs, query, limit))
}

pub fn format_rag_hits_markdown(hits: &[RagHit], query: &str) -> String {
    if hits.is_empty() {
        return format!("**RAG** for “{query}”\n\n_(no matches — try reindex or a broader query)_");
    }
    let mut lines = vec![
        format!(
            "**RAG** for “{query}” ({} hit{})",
            hits.len(),
            if hits.len() == 1 { "" } else { "s" }
        ),
        String::new(),
        "_Embedding runtime: hashed n-gram TF-IDF (no PyTorch)_".into(),
        String::new(),
    ];
    for (i, hit) in hits.iter().enumerate() {
        lines.push(format!(
            "{}. `{:.3}` · **{}** · {} `[{}]`",
            i + 1,
            hit.score,
            hit.kind,
            hit.text.chars().take(160).collect::<String>(),
            hit.id
        ));
    }
    lines.join("\n")
}

/// Compact block appended to other agent intents (auto-context).
pub fn format_rag_context_block(hits: &[RagHit]) -> String {
    if hits.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        String::new(),
        "---".into(),
        format!("**Related context** ({} hit{})", hits.len(), if hits.len() == 1 { "" } else { "s" }),
        String::new(),
    ];
    for hit in hits.iter().take(5) {
        lines.push(format!(
            "- `{:.2}` · **{}** · {} `[{}]`",
            hit.score,
            hit.kind,
            hit.text.chars().take(120).collect::<String>(),
            hit.id
        ));
    }
    lines.join("\n")
}

/// Best-effort context search for auto-injection into other intents.
pub fn related_context(root: &str, seed: &str, limit: usize) -> Vec<RagHit> {
    let seed = seed.trim();
    if seed.is_empty() {
        return Vec::new();
    }
    search_rag(root, seed, limit).unwrap_or_default()
}

#[cfg(test)]
#[path = "__tests__/agent_rag_tests.rs"]
mod tests;
