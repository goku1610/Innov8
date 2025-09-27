import asyncio
from datetime import datetime
from typing import Optional

from ai_backend.llm import generate_response
from ai_backend.app.utils.llm_logger import append_prompt_response
from ai_backend.app.repositories.snapshots import (
    insert_snapshot,
    get_last_snapshot_by_session,
    get_snapshots_by_session,
    count_snapshots_by_session,
)
from ai_backend.app.db.node_mongo import find_session_by_id
from diff_match_patch import diff_match_patch


def _build_prompt(code: str, metrics: Optional[dict] = None, context_sections: Optional[list[str]] = None) -> str:
    parts = ["CURRENT CODE:", code]
    if metrics:
        parts.append("")
        parts.append("METRICS:")
        for k, v in metrics.items():
            parts.append(f"- {k}: {v}")
    if context_sections:
        for section in context_sections:
            parts.append("")
            parts.append(section)
    return "\n".join(parts)


async def _build_compact_context_from_mongo(session_id: Optional[str]) -> list[str]:
    if not session_id:
        return []
    sections: list[str] = []
    try:
        # Latest metrics from our ai_backend snapshots
        last = await get_last_snapshot_by_session(session_id)
        if last and last.get("metrics"):
            sections.append("LATEST METRICS:")
            for k, v in (last.get("metrics") or {}).items():
                sections.append(f"- {k}: {v}")

        # Compact line history with actual values from Node session
        node_session = await find_session_by_id(session_id)
        if node_session and node_session.get("lineHistory"):
            lh = node_session.get("lineHistory") or {}
            lines_added = 0
            sections.append("LINE HISTORY:")
            # Show up to 50 lines; for each, last 3 versions with content and metrics
            for line, arr in (lh.items() if isinstance(lh, dict) else lh):
                try:
                    lst = arr if isinstance(arr, list) else []
                    if not lst:
                        continue
                    # Take the last 3 entries for this line
                    tail = lst[-3:]
                    # Build readable entries
                    pretty_entries = []
                    for e in tail:
                        ts = e.get("timestamp") if isinstance(e, dict) else None
                        content = e.get("content") if isinstance(e, dict) else None
                        metrics_obj = e.get("metrics") if isinstance(e, dict) else None
                        # Trim content to avoid huge prompts
                        if isinstance(content, str) and len(content) > 100:
                            content_display = content[:100] + "…"
                        else:
                            content_display = content if content is not None else ""
                        # Render metrics key-values if present (compact)
                        if isinstance(metrics_obj, dict) and metrics_obj:
                            items = []
                            for mk, mv in list(metrics_obj.items())[:8]:
                                items.append(f"{mk}={mv}")
                            metrics_display = " {" + ", ".join(items) + "}"
                        else:
                            metrics_display = ""
                        pretty_entries.append(f"[ts={ts}] '{content_display}'{metrics_display}")
                    sections.append(f"- L{line}: " + " | ".join(pretty_entries))
                    lines_added += 1
                    if lines_added >= 50:
                        sections.append("(truncated)")
                        break
                except Exception:
                    continue

        # Recent chat-like context if available
        if node_session and node_session.get("all_submissions"):
            subs = node_session.get("all_submissions") or []
            tail = subs[-3:]
            sections.append("RECENT RUNS (last 3):")
            for s in tail:
                t = s.get("timestamp")
                out = (s.get("output") or "").strip()
                err = (s.get("error") or "").strip()
                # Trim to keep prompt size manageable
                max_len = 1000
                out_disp = out if len(out) <= max_len else out[:max_len] + "…"
                err_disp = err if len(err) <= max_len else err[:max_len] + "…"
                sections.append(f"- ts={t}\n  output:\n{out_disp}\n  error:\n{err_disp}")

    except Exception:
        pass
    return sections


def _safe_get_dmp():
    try:
        return diff_match_patch()
    except Exception:
        return None

async def _apply_patch(previous_code: str, patch_text: str) -> str:
    dmp = _safe_get_dmp()
    if not dmp:
        # Fallback: if we can't patch, return previous to avoid breaking
        return previous_code
    patches = dmp.patch_fromText(patch_text)
    new_text, results = dmp.patch_apply(patches, previous_code)
    return new_text


async def generate_text_response_full(code: str, session_id: Optional[str], metrics: Optional[dict] = None) -> str:
    # Progressive timestamp in seconds: 30, 60, 90, ... based on snapshot count
    progressive_ts = None
    try:
        if session_id:
            count = await count_snapshots_by_session(session_id)
            progressive_ts = (count + 1) * 30  # next tick in seconds
    except Exception:
        progressive_ts = None

    context_sections = await _build_compact_context_from_mongo(session_id)
    # Merge in progressive timestamp if metrics is used
    use_metrics = dict(metrics or {})
    if progressive_ts is not None:
        use_metrics["progressiveSeconds"] = progressive_ts

    prompt = _build_prompt(code, use_metrics or None, context_sections)
    
    # System prompt to guide the LLM's behavior
    system_prompt = """You are an AI coding assistant that helps developers with their code. 
    When analyzing code, focus on:
    - Identifying bugs and potential issues
    - Suggesting improvements and optimizations
    - Explaining code behavior and logic
    - Providing clear, actionable feedback
    
    Be concise but thorough in your responses. If you see errors in the code, explain what's wrong and suggest fixes."""
    
    response = await asyncio.to_thread(generate_response, prompt, system_prompt)

    # Best-effort file log
    try:
        append_prompt_response(prompt, response, session_id=session_id, system_prompt=system_prompt)
    except Exception:
        pass

    # Persist snapshot to Mongo (best-effort; non-blocking semantics)
    try:
        doc = {
            "session_id": session_id,
            "code": code,
            "metrics": metrics or {},
            "prompt": prompt,
            "response": response,
            "created_at": datetime.utcnow(),
        }
        await insert_snapshot(doc)
    except Exception:
        pass

    return response


async def generate_text_response_patch(patch_text: str, session_id: Optional[str], metrics_patch: Optional[dict] = None) -> str:
    if not session_id:
        # Cannot apply patch without a session context; fallback to no-op code
        code = ""
        merged_metrics = {}
    else:
        last = await get_last_snapshot_by_session(session_id)
        prev_code = last.get("code") if last else ""
        code = await _apply_patch(prev_code, patch_text)
        prev_metrics = last.get("metrics") if last else {}
        merged_metrics = dict(prev_metrics or {})
        if metrics_patch:
            merged_metrics.update(metrics_patch)

    return await generate_text_response_full(code, session_id, merged_metrics)


