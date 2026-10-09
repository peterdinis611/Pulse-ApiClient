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
BODY_SNIPPET_CHARS = 280
DEFAULT_PRUNE_4XX_DAYS = 30


def _now_iso() -> str:
    millis = int(time.time() * 1000)
    secs, ms = divmod(millis, 1000)
    return f"{secs}.{ms:03d}Z"


def rag_index_path(root: str | Path) -> Path:
    return Path(root) / ".pulse" / "rag-index.json"


def _snippet(text: str, max_chars: int = BODY_SNIPPET_CHARS) -> str:
    trimmed = " ".join((text or "").split())
    if len(trimmed) <= max_chars:
        return trimmed
    return trimmed[:max_chars] + "…"


def _extract_graphql_operation(body: str) -> str | None:
    trimmed = (body or "").strip()
    if not trimmed:
        return None
    try:
        parsed = json.loads(trimmed)
        if isinstance(parsed, dict):
            name = parsed.get("operationName")
            if isinstance(name, str) and name.strip():
                return name.strip()
            query = parsed.get("query")
            if isinstance(query, str):
                return _extract_graphql_operation(query)
    except json.JSONDecodeError:
        pass
    for line in trimmed.splitlines():
        line = line.strip()
        for prefix in ("query ", "mutation ", "subscription "):
            lower = line.lower()
            if lower.startswith(prefix):
                rest = line[len(prefix) :]
                name = re.split(r"[\s({]", rest, maxsplit=1)[0].strip()
                if name and name != "{":
                    return name
    return None


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


def parse_hybrid_query(raw: str) -> dict[str, Any]:
    filters: dict[str, Any] = {
        "method": None,
        "status": None,
        "status_class": None,
        "env": None,
        "kind": None,
        "free_text": "",
    }
    free: list[str] = []
    for token in (raw or "").split():
        if ":" in token:
            key, value = token.split(":", 1)
            key_l = key.lower()
            value = value.strip()
            if not value:
                free.append(token)
                continue
            if key_l in {"method", "m"}:
                filters["method"] = value.upper()
            elif key_l in {"status", "s"}:
                if value.lower() in {"2xx", "3xx", "4xx", "5xx"}:
                    filters["status_class"] = value.lower()
                else:
                    filters["status"] = value
            elif key_l in {"env", "environment"}:
                filters["env"] = value.lower()
            elif key_l in {"kind", "type"}:
                filters["kind"] = value.lower()
            else:
                free.append(token)
        else:
            free.append(token)
    filters["free_text"] = " ".join(free)
    return filters


def _meta_get(meta: Any, *keys: str) -> str:
    if not isinstance(meta, dict):
        return ""
    for key in keys:
        if key.startswith("/"):
            cur: Any = meta
            ok = True
            for part in key.strip("/").split("/"):
                if isinstance(cur, dict) and part in cur:
                    cur = cur[part]
                else:
                    ok = False
                    break
            if ok and cur is not None:
                return str(cur)
        elif key in meta and meta[key] is not None:
            return str(meta[key])
    return ""


def _status_matches(status: str, exact: str | None, klass: str | None) -> bool:
    if exact and status != exact:
        return False
    if klass:
        try:
            code = int(status)
        except ValueError:
            return False
        ranges = {"2xx": range(200, 300), "3xx": range(300, 400), "4xx": range(400, 500), "5xx": range(500, 600)}
        if code not in ranges.get(klass, range(0, 1000)):
            return False
    return True


def _doc_matches(doc: dict[str, Any], filters: dict[str, Any]) -> bool:
    meta = doc.get("meta")
    text = str(doc.get("text") or "")
    text_l = text.lower()
    if filters.get("kind") and str(doc.get("kind") or "").lower() != filters["kind"]:
        return False
    if filters.get("method"):
        method = _meta_get(meta, "method", "/request/method") or ""
        if method:
            if method.upper() != filters["method"]:
                return False
        elif filters["method"] not in text.upper():
            return False
    status = _meta_get(meta, "status", "/response/status")
    if not status:
        for token in text.split():
            if token.isdigit() and len(token) == 3:
                status = token
                break
    if not _status_matches(status, filters.get("status"), filters.get("status_class")):
        return False
    if filters.get("env"):
        env = filters["env"]
        in_meta = _meta_get(meta, "env", "environment", "/request/environment").lower()
        if env not in in_meta and env not in text_l:
            return False
    return True


def search_documents(docs: list[dict[str, Any]], query: str, limit: int = 8) -> list[dict[str, Any]]:
    filters = parse_hybrid_query(query)
    filtered = [d for d in docs if _doc_matches(d, filters)]
    free = filters.get("free_text") or ""
    if not filtered:
        return []
    if not free.strip():
        return [
            {
                "id": d.get("id"),
                "kind": d.get("kind"),
                "text": d.get("text"),
                "score": 1.0,
                "meta": d.get("meta"),
            }
            for d in filtered[: max(1, limit)]
        ]

    query_tokens = tokenize(free)
    if not query_tokens:
        return []
    doc_tokens = [tokenize(str(d.get("text") or "")) for d in filtered]
    n = float(len(filtered))
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
        doc = filtered[i]
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


def _test_fail_snippet(entry: dict[str, Any]) -> str:
    results = ((entry.get("testResults") or {}).get("results")) or []
    fails = []
    for item in results:
        if item.get("passed") is False:
            fails.append(f"{item.get('name') or 'test'} {item.get('message') or ''}")
        if len(fails) >= 3:
            break
    if fails:
        return "test_fail " + " ".join(fails)
    failed = entry.get("failed")
    if isinstance(failed, int) and failed > 0:
        return f"test_fail count:{failed}"
    return ""


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
        req_body = str(request.get("body") or "")
        resp_body = str(response.get("body") or "")
        gql = _extract_graphql_operation(req_body) or ""
        parts = [
            str(entry.get("source") or "agent"),
            str(entry.get("kind") or ""),
            str(request.get("method") or ""),
            str(request.get("name") or ""),
            str(request.get("url") or ""),
            str(response.get("status") or ""),
            f"graphql {gql}" if gql else "",
            _snippet(req_body),
            _snippet(resp_body),
            _test_fail_snippet(entry),
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


def _load_index(root: Path) -> dict[str, Any]:
    path = rag_index_path(root)
    if not path.is_file():
        return {"version": 1, "updatedAt": _now_iso(), "embeddingRuntime": "tfidf-ngram-v1", "docs": []}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {"docs": []}


def _save_index(root: Path, payload: dict[str, Any]) -> None:
    path = rag_index_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def rebuild_rag_index(root: str | Path, extra_docs: list[dict[str, Any]] | None = None) -> int:
    root_p = Path(root)
    by_id: dict[str, dict[str, Any]] = {}
    for doc in _docs_from_history(root_p) + _docs_from_facts(root_p) + (extra_docs or []):
        doc_id = str(doc.get("id") or "")
        if doc_id:
            by_id[doc_id] = doc
    docs = list(by_id.values())
    _save_index(
        root_p,
        {
            "version": 1,
            "updatedAt": _now_iso(),
            "embeddingRuntime": "tfidf-ngram-v1",
            "docs": docs,
        },
    )
    return len(docs)


def upsert_rag_docs(root: str | Path, docs: list[dict[str, Any]]) -> int:
    root_p = Path(root)
    payload = _load_index(root_p)
    by_id = {str(d.get("id")): d for d in (payload.get("docs") or []) if d.get("id")}
    for doc in docs:
        doc_id = str(doc.get("id") or "")
        if doc_id:
            by_id[doc_id] = doc
    docs_out = list(by_id.values())
    _save_index(
        root_p,
        {
            "version": 1,
            "updatedAt": _now_iso(),
            "embeddingRuntime": "tfidf-ngram-v1",
            "docs": docs_out,
        },
    )
    return len(docs_out)


def prune_rag_index(
    root: str | Path,
    older_than_days: int = DEFAULT_PRUNE_4XX_DAYS,
    max_docs: int = 5000,
) -> int:
    root_p = Path(root)
    payload = _load_index(root_p)
    docs = list(payload.get("docs") or [])
    now = int(time.time())
    cutoff = now - older_than_days * 86_400

    def keep(doc: dict[str, Any]) -> bool:
        kind = str(doc.get("kind") or "")
        if kind not in {"request", "history"}:
            return True
        status = _meta_get(doc.get("meta"), "status", "/response/status")
        try:
            code = int(status)
        except ValueError:
            return True
        if not (400 <= code < 500):
            return True
        sent = _meta_get(doc.get("meta"), "sentAt", "sent_at")
        head = sent.split(".", 1)[0]
        try:
            secs = int(head)
        except ValueError:
            return True
        if secs < 1_000_000_000:
            return True
        return secs >= cutoff

    docs = [d for d in docs if keep(d)]
    if len(docs) > max_docs:
        docs.sort(key=lambda d: _meta_get(d.get("meta"), "sentAt", "updatedAt"), reverse=True)
        docs = docs[:max_docs]
    _save_index(
        root_p,
        {
            "version": 1,
            "updatedAt": _now_iso(),
            "embeddingRuntime": "tfidf-ngram-v1",
            "docs": docs,
        },
    )
    return len(docs)


def search_rag(root: str | Path, query: str, limit: int = 8) -> list[dict[str, Any]]:
    path = rag_index_path(root)
    if not path.is_file():
        rebuild_rag_index(root)
    raw = _load_index(Path(root))
    docs = raw.get("docs") or []
    if not docs:
        rebuild_rag_index(root)
        docs = _load_index(Path(root)).get("docs") or []
    return search_documents(docs, query, limit)


def related_context(root: str | Path, seed: str, limit: int = 5) -> list[dict[str, Any]]:
    seed = (seed or "").strip()
    if not seed:
        return []
    return search_rag(root, seed, limit)


def format_rag_hits_markdown(hits: list[dict[str, Any]], query: str) -> str:
    if not hits:
        return f'**RAG** for “{query}”\n\n_(no matches — try reindex or a broader query)_'
    lines = [
        f'**RAG** for “{query}” ({len(hits)} hit{"s" if len(hits) != 1 else ""})',
        "",
        "_Embedding runtime: hashed n-gram TF-IDF · filters: `method:POST status:4xx`_",
        "",
    ]
    for i, hit in enumerate(hits, start=1):
        text = str(hit.get("text") or "")[:160]
        lines.append(
            f"{i}. `{hit.get('score', 0):.3f}` · **{hit.get('kind')}** · {text} `[{hit.get('id')}]`"
        )
    return "\n".join(lines)


def format_rag_context_block(hits: list[dict[str, Any]]) -> str:
    if not hits:
        return ""
    lines = [
        "",
        "---",
        f"**Related context** ({len(hits)} hit{'s' if len(hits) != 1 else ''})",
        "",
    ]
    for hit in hits[:5]:
        text = str(hit.get("text") or "")[:120]
        lines.append(
            f"- `{hit.get('score', 0):.2f}` · **{hit.get('kind')}** · {text} `[{hit.get('id')}]`"
        )
    return "\n".join(lines)
