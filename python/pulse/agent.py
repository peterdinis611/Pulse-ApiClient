"""Local intent router for CLI / MCP (no LLM). Prefers pulse_native when available."""

from __future__ import annotations

import json
import os
import re
from typing import Any

from pulse.curl import curl_to_payload
from pulse.graphql import summarize_schema
from pulse.memory import (
    delete_fact,
    format_facts_markdown,
    get_fact,
    list_facts,
    parse_remember_pair,
    search_facts,
    upsert_fact,
)
from pulse.rag import (
    format_rag_context_block,
    format_rag_hits_markdown,
    prune_rag_index,
    rebuild_rag_index,
    related_context,
    search_rag,
)
from pulse.sse import parse_text as parse_sse_text
from pulse.workspace import read_history, workspace_root, workspace_status

AGENT_HELP_TEXT = """I understand these intents (local, no LLM):

• **Import cURL** — paste a curl command → JSON request payload
• **Workspace status** — Git workspace root + pending mutations
• **Agent history** — recent entries from `.pulse/history.jsonl`
• **Memory** — `remember key=value`, `recall key`, `forget key`, `list memory`
• **RAG** — `search history …` / `rag method:POST status:4xx …` (TF-IDF + filters; `reindex rag`)
• **GraphQL summarize** — pass introspection/response body via `--body` / `body`
• **Parse SSE** — paste an SSE document (event/data blocks)

Desktop-only (use the in-app Agent view):
• Explain last response / test failures
• Run active collection (needs confirm)

Examples: `pulse agent "workspace status"` · `pulse agent 'remember env=staging'`"""

_CURL_BLOCK = re.compile(r"```(?:bash|sh|shell|zsh)?\s*([\s\S]*?curl[\s\S]*?)```", re.I)
_CURL_LINE = re.compile(r"((?:^|\n)\s*curl\b[\s\S]+)", re.I)
_SSE_FENCE = re.compile(r"```(?:sse|text)?\s*([\s\S]*?)```", re.I)


def _extract_curl(input_text: str) -> str | None:
    fenced = _CURL_BLOCK.search(input_text)
    if fenced and "curl" in fenced.group(1).lower():
        return fenced.group(1).strip()
    loose = _CURL_LINE.search(input_text)
    if loose:
        return loose.group(1).strip()
    trimmed = input_text.strip()
    if trimmed.lower().startswith("curl "):
        return trimmed
    return None


def _extract_sse(input_text: str) -> str | None:
    fenced = _SSE_FENCE.search(input_text)
    if fenced and re.search(r"(?:^|\n)\s*(?:data|event|id|retry):", fenced.group(1), re.I):
        return fenced.group(1).strip()
    if re.search(r"(?:^|\n)\s*(?:data|event|id|retry):", input_text, re.I | re.M) and (
        "\n\n" in input_text or re.search(r"\n\s*(?:data|event|id|retry):", input_text, re.I | re.M)
    ):
        return input_text.strip()
    return None


def route_agent_input(raw: str) -> dict[str, Any]:
    input_text = (raw or "").strip()
    if not input_text:
        return {"kind": "help"}
    quick = input_text.lower()
    if quick in {"help", "?", "quick:help"}:
        return {"kind": "help"}
    if quick in {"quick:explain", "explain response"} or re.search(
        r"explain\s+(last\s+)?response", quick
    ):
        return {"kind": "explain_response"}
    if (
        quick == "quick:tests"
        or re.search(r"explain\s+(test|tests|failures)", quick)
        or re.search(r"test\s+failures", quick)
    ):
        return {"kind": "explain_tests"}
    if (
        quick == "quick:workspace"
        or re.search(r"workspace\s+status", quick)
        or re.search(r"pending\s+mutations?", quick)
        or quick == "status"
    ):
        return {"kind": "workspace_status"}
    if (
        quick == "quick:history"
        or re.search(r"agent\s+history", quick)
        or re.search(r"workspace\s+history", quick)
    ):
        return {"kind": "workspace_history"}
    if quick == "quick:run" or re.search(r"^run\s+(active\s+)?collection", quick):
        return {"kind": "run_collection"}
    if re.search(r"graphql\s+(summarize|schema|introspect)", quick) or quick == "summarize schema":
        return {"kind": "graphql_summarize"}
    if quick in {"quick:memory", "list memory", "memory list", "show memory"}:
        return {"kind": "memory_list"}
    if quick in {"quick:rag", "reindex rag", "rag reindex", "rebuild rag"}:
        return {"kind": "rag_reindex"}
    rag_match = re.match(
        r"^(?:rag|search\s+history|find\s+in\s+history|search\s+memory)\s+(.+)$", quick
    )
    if rag_match:
        return {"kind": "rag_search", "query": rag_match.group(1).strip()}
    remember_match = re.match(r"^remember\s+(.+)$", quick)
    if remember_match:
        rest = input_text.split(None, 1)[1] if " " in input_text else ""
        scope = "workspace"
        parts = []
        for part in rest.split():
            low = part.lower()
            if low in {"--local", "--scope=local", "scope=local"}:
                scope = "local"
            else:
                parts.append(part)
        pair = parse_remember_pair(" ".join(parts))
        if pair:
            return {"kind": "remember", "key": pair[0], "value": pair[1], "scope": scope}
        return {"kind": "unknown", "input": "Usage: remember key=value  (optional --local)"}
    recall_match = re.match(r"^(?:recall|what\s+do\s+you\s+remember\s+about)\s+(.+)$", quick)
    if recall_match:
        return {"kind": "recall", "query": recall_match.group(1).strip()}
    forget_match = re.match(r"^forget\s+(.+)$", quick)
    if forget_match:
        return {"kind": "forget", "key": forget_match.group(1).strip()}

    curl = _extract_curl(input_text)
    if curl:
        return {"kind": "import_curl", "curl": curl}
    if quick == "quick:curl" or re.search(r"import\s+curl", quick):
        return {"kind": "unknown", "input": "Paste a cURL command (or wrap it in a ```bash fence)."}

    sse = _extract_sse(input_text)
    if sse:
        return {"kind": "sse_parse", "text": sse}
    if re.search(r"parse\s+sse", quick):
        return {"kind": "unknown", "input": "Paste an SSE document to parse (event/data blocks)."}

    return {"kind": "unknown", "input": input_text}


def _summarize_schema_markdown(body: str) -> str | None:
    summary = summarize_schema(body)
    if not summary:
        return None
    types = summary.get("types") or []
    lines = [
        "**GraphQL schema summary**",
        f"- queryType: {summary.get('query_type') or summary.get('queryType') or '—'}",
        f"- mutationType: {summary.get('mutation_type') or summary.get('mutationType') or '—'}",
        f"- subscriptionType: {summary.get('subscription_type') or summary.get('subscriptionType') or '—'}",
        f"- object types with fields: {len(types)}",
        "",
    ]
    for item in types[:40]:
        fields = (item.get("fields") or [])[:12]
        more = "…" if len(item.get("fields") or []) > 12 else ""
        lines.append(
            f"- **{item.get('name')}** ({item.get('kind') or 'OBJECT'}): {', '.join(fields)}{more}"
        )
    if len(types) > 40:
        lines.append(f"…+{len(types) - 40} more types")
    return "\n".join(lines)


def _execute_py(
    intent: dict[str, Any],
    *,
    workspace: str | None,
    body: str | None,
    history_limit: int,
) -> dict[str, Any]:
    kind = intent.get("kind") or "unknown"
    if kind == "help":
        return {"kind": kind, "markdown": AGENT_HELP_TEXT, "data": None}
    if kind == "unknown":
        message = intent.get("input") or ""
        return {"kind": kind, "markdown": f"{message}\n\n---\n{AGENT_HELP_TEXT}", "data": None}
    if kind in {"explain_response", "explain_tests", "run_collection"}:
        return {
            "kind": kind,
            "markdown": (
                "This intent needs the desktop in-app Agent (active tab / confirm UI). "
                "CLI and MCP support offline intents: cURL import, SSE parse, workspace status/history, GraphQL summarize."
            ),
            "data": {"desktopOnly": True},
        }
    if kind == "import_curl":
        payload = curl_to_payload(str(intent.get("curl") or ""))
        return {
            "kind": kind,
            "markdown": f"Parsed **{payload.get('method')}** `{payload.get('url')}`.",
            "data": payload,
        }
    if kind == "workspace_status":
        root = workspace or workspace_root()
        if not root:
            raise ValueError("No workspace root. Set PULSE_WORKSPACE or pass workspace.")
        from pathlib import Path

        status = workspace_status(Path(root))
        pending = int(status.get("pending") or 0)
        history_count = int(status.get("history") or 0)
        memory_count = len(list_facts(root))
        lines = [
            f"**Workspace:** `{status.get('root')}`",
            f"**Name:** {status.get('name')}",
            f"**Requests:** {status.get('requests')}",
            f"**Pending mutations:** {pending}",
            f"**Agent history entries:** {history_count}",
            f"**Memory facts:** {memory_count}",
        ]
        facts = list_facts(root)[:8]
        markdown = "\n".join(lines)
        if facts:
            markdown += "\n\n---\n" + format_facts_markdown(facts, "Known facts")
        seed = f"{status.get('name') or ''} preferred_base_url"
        markdown += format_rag_context_block(related_context(root, seed, 5))
        return {"kind": kind, "markdown": markdown, "data": status}
    if kind == "workspace_history":
        root = workspace or workspace_root()
        if not root:
            raise ValueError("No workspace root. Set PULSE_WORKSPACE or pass workspace.")
        from pathlib import Path

        entries = list(reversed(read_history(Path(root), limit=history_limit)))
        if not entries:
            return {"kind": kind, "markdown": "Agent history is empty.", "data": {"count": 0, "entries": []}}
        lines = ["**Recent agent history** (newest first):", ""]
        for entry in entries:
            source = entry.get("source") or "agent"
            sent_at = entry.get("sentAt") or entry.get("id") or ""
            request = entry.get("request") or {}
            response = entry.get("response") or {}
            method = request.get("method") or ""
            url = request.get("url") or ""
            status = response.get("status")
            status_bit = f" → {status}" if status is not None else ""
            method_bit = f" · {method}" if method else ""
            url_bit = f" {url}" if url else ""
            lines.append(f"- `{source}` {sent_at}{method_bit}{url_bit}{status_bit}")
        return {
            "kind": kind,
            "markdown": "\n".join(lines),
            "data": {"count": len(entries), "entries": entries},
        }
    if kind == "graphql_summarize":
        raw_body = (body or "").strip()
        if not raw_body:
            raise ValueError("No GraphQL body. Pass --body / body with an introspection or response JSON.")
        markdown = _summarize_schema_markdown(raw_body)
        if not markdown:
            raise ValueError("Body is not a GraphQL introspection payload.")
        return {"kind": kind, "markdown": markdown, "data": summarize_schema(raw_body)}
    if kind == "sse_parse":
        events = parse_sse_text(str(intent.get("text") or ""))
        if not events:
            return {"kind": kind, "markdown": "No SSE events found in the pasted document.", "data": {"events": []}}
        lines = [f"**Parsed {len(events)} SSE event(s):**", ""]
        for index, event in enumerate(events[:30], start=1):
            bits = []
            if event.get("event"):
                bits.append(f"event={event['event']}")
            if event.get("id"):
                bits.append(f"id={event['id']}")
            if event.get("retryMs") is not None or event.get("retry_ms") is not None:
                bits.append(f"retry={event.get('retryMs', event.get('retry_ms'))}")
            label = " · ".join(bits) if bits else "message"
            lines.append(f"{index}. {label}")
            lines.append("```")
            lines.append(event.get("data") or "(empty data)")
            lines.append("```")
        if len(events) > 30:
            lines.append(f"…+{len(events) - 30} more")
        return {"kind": kind, "markdown": "\n".join(lines), "data": events}
    if kind == "remember":
        if not workspace:
            raise ValueError("No workspace root. Set PULSE_WORKSPACE or pass workspace.")
        fact = upsert_fact(
            workspace,
            key=str(intent.get("key") or ""),
            value=str(intent.get("value") or ""),
            scope=str(intent.get("scope") or "workspace"),
            source="cli-agent",
        )
        return {
            "kind": kind,
            "markdown": f"Remembered `{fact['key']}` = {fact['value']} (`{fact['scope']}`).",
            "data": fact,
        }
    if kind == "recall":
        if not workspace:
            raise ValueError("No workspace root. Set PULSE_WORKSPACE or pass workspace.")
        query = str(intent.get("query") or "").strip()
        if not query:
            return {"kind": kind, "markdown": "Usage: recall <key or search>", "data": None}
        exact = get_fact(workspace, query)
        if exact:
            note = f"\n_{exact['note']}_" if exact.get("note") else ""
            return {
                "kind": kind,
                "markdown": f"**{exact['key']}** = {exact['value']} `[{exact['scope']}]`{note}",
                "data": exact,
            }
        found = search_facts(workspace, query)
        return {
            "kind": kind,
            "markdown": format_facts_markdown(found, f"Recall “{query}”"),
            "data": {"count": len(found), "facts": found},
        }
    if kind == "forget":
        if not workspace:
            raise ValueError("No workspace root. Set PULSE_WORKSPACE or pass workspace.")
        key = str(intent.get("key") or "")
        removed = delete_fact(workspace, key)
        return {
            "kind": kind,
            "markdown": f"Forgot `{key}`." if removed else f"No memory found for `{key}`.",
            "data": {"key": key, "removed": removed},
        }
    if kind == "memory_list":
        if not workspace:
            raise ValueError("No workspace root. Set PULSE_WORKSPACE or pass workspace.")
        facts = list_facts(workspace)
        return {
            "kind": kind,
            "markdown": format_facts_markdown(facts, "Agent memory"),
            "data": {"count": len(facts), "facts": facts},
        }
    if kind == "rag_search":
        if not workspace:
            raise ValueError("No workspace root. Set PULSE_WORKSPACE or pass workspace.")
        query = str(intent.get("query") or "").strip()
        if not query:
            return {
                "kind": kind,
                "markdown": "Usage: search history <query>  ·  rag <query>",
                "data": None,
            }
        hits = search_rag(workspace, query, limit=8)
        return {
            "kind": kind,
            "markdown": format_rag_hits_markdown(hits, query),
            "data": {"query": query, "hits": hits},
        }
    if kind == "rag_reindex":
        if not workspace:
            raise ValueError("No workspace root. Set PULSE_WORKSPACE or pass workspace.")
        count = rebuild_rag_index(workspace)
        pruned = prune_rag_index(workspace)
        return {
            "kind": kind,
            "markdown": (
                f"Rebuilt RAG index with **{count}** documents (history + facts), "
                f"**{pruned}** after prune.\n\n"
                "_Embedding runtime: hashed n-gram TF-IDF · hybrid filters: `method:POST status:4xx`_"
            ),
            "data": {"count": count, "afterPrune": pruned},
        }
    return {"kind": kind, "markdown": AGENT_HELP_TEXT, "data": None}


def run_agent(
    raw: str,
    *,
    workspace: str | None = None,
    body: str | None = None,
    history_limit: int = 15,
    source: str = "cli-agent",
    record_history: bool = True,
) -> dict[str, Any]:
    """Route + execute. Prefers Rust `run_agent_json` when pulse_native is available."""
    root = workspace or os.environ.get("PULSE_WORKSPACE") or workspace_root()
    try:
        import pulse_native

        if hasattr(pulse_native, "run_agent_json"):
            return json.loads(
                pulse_native.run_agent_json(
                    raw,
                    str(root) if root else None,
                    body,
                    history_limit,
                    source,
                    record_history,
                )
            )
    except ImportError:
        pass
    intent = route_agent_input(raw)
    return _execute_py(
        intent,
        workspace=str(root) if root else None,
        body=body,
        history_limit=history_limit,
    )
