//! Lightweight RAG over request/agent history — hashed n-gram + TF-IDF cosine.
//! No PyTorch / ONNX model download; swap `embed_tokens` later for a neural backend.

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RagIndexFile {
    version: u32,
    updated_at: String,
    /// Runtime tag so we can evolve backends later (`tfidf-ngram-v1`, `onnx-…`).
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
    // URL path segments often appear as one token — also emit pieces split by `.` / `-`
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
    // FNV-1a 64 → bucket
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in token.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    (hash as usize) % EMBED_DIM
}

/// Sparse bag → dense hashed embedding (hashing trick), L2-normalized.
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
        // log-scaled TF into hashed dims (collisions ok for light RAG)
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

/// Corpus-aware TF-IDF reweight on top of hashed bags for better ranking.
fn search_tfidf(docs: &[RagDocument], query: &str, limit: usize) -> Vec<RagHit> {
    let query_tokens = tokenize(query);
    if query_tokens.is_empty() || docs.is_empty() {
        return Vec::new();
    }

    let doc_tokens: Vec<Vec<String>> = docs.iter().map(|d| tokenize(&d.text)).collect();
    let n = docs.len() as f32;

    // Document frequency
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
    search_tfidf(docs, query, limit)
}

fn history_entry_to_doc(entry: &Value) -> Option<RagDocument> {
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
    let kind_field = entry
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("");
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
    let status = entry
        .pointer("/response/status")
        .and_then(|v| v.as_u64())
        .map(|s| s.to_string())
        .unwrap_or_default();
    let sent_at = entry
        .get("sentAt")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let text = [
        source,
        kind_field,
        method,
        name,
        url,
        status.as_str(),
        sent_at,
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join(" ");

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
        .filter_map(history_entry_to_doc)
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
    // id, sent_at, method, name, url, status
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

    // Dedupe by id (later wins)
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
        format!("**RAG** for “{query}” ({} hit{})", hits.len(), if hits.len() == 1 { "" } else { "s" }),
        String::new(),
        "_Embedding runtime: hashed n-gram TF-IDF (no PyTorch)_".into(),
        String::new(),
    ];
    for (i, hit) in hits.iter().enumerate() {
        lines.push(format!(
            "{}. `{:.3}` · **{}** · {}",
            i + 1,
            hit.score,
            hit.kind,
            hit.text
        ));
    }
    lines.join("\n")
}

#[cfg(test)]
#[path = "__tests__/agent_rag_tests.rs"]
mod tests;
