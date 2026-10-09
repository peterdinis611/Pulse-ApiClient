"""Lightweight RAG over history + facts — hashed n-gram TF-IDF (no PyTorch)."""

from __future__ import annotations

import json
import math
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any

from pulse.memory import list_facts
from pulse.workspace import read_history

EMBED_DIM = 256
NGRAM_MIN = 3
NGRAM_MAX = 5


def _now_iso() -> str:
    millis = int(time.time() * 1000)
    secs, ms = divmod(millis, 1000)
    return f"{secs}.{ms:03d}Z"


def rag_index_path(root: str | Path) -> Path:
    return Path(root) / ".pulse" / "rag-index.json"


def tokenize(text: str) -> list[str]:
    lower = (text or "").lower()
    tokens: list[str] = []
    current: list[str] = []

    def flush() -> None:
        nonlocal current
        if not current:
            return
        token = "".join(current)
        current = []
        _push_token_and_ngrams(tokens, token)

    for ch in lower:
        if ch.isalnum() or ch in {"_", "-", "."}:
            current.append(ch)
        else:
            flush()
    flush()
    return tokens


def _push_token_and_ngrams(out: list[str], token: str) -> None:
    if len(token) < 2:
        return
    out.append(token)
    for part in re.split(r"[.\-_]", token):
        if len(part) >= 2 and part != token:
            out.append(part)
    chars = list(token)
    if len(chars) >= NGRAM_MIN:
        for n in range(NGRAM_MIN, min(NGRAM_MAX, len(chars)) + 1):
            for i in range(0, len(chars) - n + 1):
                out.append("".join(chars[i : i + n]))


def _hash_token(token: str) -> int:
    h = 0xCBF29CE484222325
    for byte in token.encode("utf-8"):
        h ^= byte
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return h % EMBED_DIM


def _l2_normalize(vec: list[float]) -> None:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 1e-9:
        for i in range(len(vec)):
            vec[i] /= norm


def _weighted_embed(tokens: list[str], idf: dict[str, float]) -> list[float]:
    vec = [0.0] * EMBED_DIM
    tf = Counter(tokens)
    for token, count in tf.items():
        w = (1.0 + math.log(count)) * idf.get(token, 1.0)
        vec[_hash_token(token)] += w
    _l2_normalize(vec)
    return vec


def _cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def search_documents(docs: list[dict[str, Any]], query: str, limit: int = 8) -> list[dict[str, Any]]:
    query_tokens = tokenize(query)
    if not query_tokens or not docs:
        return []
    doc_tokens = [tokenize(str(d.get("text") or "")) for d in docs]
    n = float(len(docs))
    df: Counter[str] = Counter()
    for tokens in doc_tokens:
        df.update(set(tokens))

    def idf(token: str) -> float:
        return math.log((n + 1.0) / (df.get(token, 0) + 1.0)) + 1.0

    idf_map = {t: idf(t) for t in set(query_tokens)}
    for tokens in doc_tokens:
        for t in set(tokens):
            if t not in idf_map:
                idf_map[t] = idf(t)

    q_vec = _weighted_embed(query_tokens, idf_map)
    scored: list[tuple[int, float]] = []
    for i, tokens in enumerate(doc_tokens):
        score = _cosine(q_vec, _weighted_embed(tokens, idf_map))
        if score > 0.02:
            scored.append((i, score))
    scored.sort(key=lambda item: item[1], reverse=True)
    hits = []
    for i, score in scored[: max(1, limit)]:
        doc = docs[i]
        hits.append(
            {
                "id": doc.get("id"),
                "kind": doc.get("kind"),
                "text": doc.get("text"),
                "score": score,
                "meta": doc.get("meta"),
            }
        )
    return hits


def _docs_from_history(root: Path) -> list[dict[str, Any]]:
    docs = []
    for entry in read_history(root, limit=2000):
        if not isinstance(entry, dict):
            continue
        eid = str(entry.get("id") or "")
        if not eid:
            continue
        request = entry.get("request") or {}
        response = entry.get("response") or {}
        parts = [
            str(entry.get("source") or "agent"),
            str(entry.get("kind") or ""),
            str(request.get("method") or ""),
            str(request.get("name") or ""),
            str(request.get("url") or ""),
            str(response.get("status") or ""),
            str(entry.get("sentAt") or ""),
        ]
        text = " ".join(p for p in parts if p)
        if not text.strip():
            continue
        docs.append({"id": f"hist:{eid}", "kind": "history", "text": text, "meta": entry})
    return docs


def _docs_from_facts(root: Path) -> list[dict[str, Any]]:
    docs = []
    for fact in list_facts(root):
        text = f"fact {fact.get('key')} {fact.get('value')} {' '.join(fact.get('tags') or [])} {fact.get('note') or ''}"
        docs.append(
            {
                "id": f"fact:{fact.get('id')}",
                "kind": "fact",
                "text": text,
                "meta": fact,
            }
        )
    return docs


def rebuild_rag_index(root: str | Path, extra_docs: list[dict[str, Any]] | None = None) -> int:
    root_p = Path(root)
    by_id: dict[str, dict[str, Any]] = {}
    for doc in _docs_from_history(root_p) + _docs_from_facts(root_p) + (extra_docs or []):
        doc_id = str(doc.get("id") or "")
        if doc_id:
            by_id[doc_id] = doc
    docs = list(by_id.values())
    path = rag_index_path(root_p)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "updatedAt": _now_iso(),
        "embeddingRuntime": "tfidf-ngram-v1",
        "docs": docs,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return len(docs)


def search_rag(root: str | Path, query: str, limit: int = 8) -> list[dict[str, Any]]:
    path = rag_index_path(root)
    if not path.is_file():
        rebuild_rag_index(root)
    raw = json.loads(path.read_text(encoding="utf-8"))
    docs = raw.get("docs") or []
    if not docs:
        rebuild_rag_index(root)
        raw = json.loads(path.read_text(encoding="utf-8"))
        docs = raw.get("docs") or []
    return search_documents(docs, query, limit)


def format_rag_hits_markdown(hits: list[dict[str, Any]], query: str) -> str:
    if not hits:
        return f'**RAG** for “{query}”\n\n_(no matches — try reindex or a broader query)_'
    lines = [
        f'**RAG** for “{query}” ({len(hits)} hit{"s" if len(hits) != 1 else ""})',
        "",
        "_Embedding runtime: hashed n-gram TF-IDF (no PyTorch)_",
        "",
    ]
    for i, hit in enumerate(hits, start=1):
        lines.append(f"{i}. `{hit.get('score', 0):.3f}` · **{hit.get('kind')}** · {hit.get('text')}")
    return "\n".join(lines)
