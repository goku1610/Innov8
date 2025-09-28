import asyncio
import json
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


def _extract_question_text(question_json: Optional[object]) -> Optional[str]:
    """Return only the plain problem text from a rich question object.

    Tries a set of common keys and falls back to None if not found.
    """
    if not question_json:
        return None
    if isinstance(question_json, str):
        stripped = question_json.strip()
        return stripped or None
    if isinstance(question_json, dict):
        candidate_keys = [
            "Full_question",
            "full_question",
            "fullQuestion",
            "problem",
            "problem_text",
            "problemStatement",
            "problem_statement",
            "description",
            "short_description",
            "statement",
            "question",
            "prompt",
            "body",
            "text",
            "content",
        ]
        for key in candidate_keys:
            try:
                value = question_json.get(key)
            except Exception:
                value = None
            if isinstance(value, str):
                stripped = value.strip()
                if stripped:
                    return stripped
    return None


async def generate_text_response_full(code: str, session_id: Optional[str], metrics: Optional[dict] = None, question_json: Optional[dict] = None) -> str:
    # Progressive timestamp in seconds: 30, 60, 90, ... based on snapshot count
    progressive_ts = None
    try:
        if session_id:
            count = await count_snapshots_by_session(session_id)
            progressive_ts = (count + 1) * 60  # next tick in seconds
    except Exception:
        progressive_ts = None

    context_sections = await _build_compact_context_from_mongo(session_id)
    # Include only the plain problem text (not the full question JSON)
    question_text = _extract_question_text(question_json)
    if question_text:
        context_sections = ["QUESTION:", question_text] + context_sections
    # Merge in progressive timestamp if metrics is used
    use_metrics = dict(metrics or {})
    if progressive_ts is not None:
        use_metrics["progressiveSeconds"] = progressive_ts

    prompt = _build_prompt(code, use_metrics or None, context_sections)
    
    # System prompt to guide the LLM's behavior
    system_prompt = """You are an advanced AI assistant tasked with analyzing a developer's coding session to determine if they are struggling. Your goal is to decide whether to escalate the situation to a more powerful Large Language Model (LLM) for assistance.
Follow these instructions precisely to perform your analysis.
Task:
Analyze the provided user coding session data to determine if the user is struggling and whether a more powerful Large Language Model (LLM) should be called for assistance. The analysis must be performed step-by-step, and the final output must be a single JSON object with two keys: 'should_call_llm' and 'reasoning'.
Instructions:
Thinking Process:
Step 1: Code Analysis - Examine the CURRENT CODE. Does it appear to be making progress toward a solution? Are there obvious syntax errors, logical flaws, or incomplete thoughts? Consider the RECENT RUNS to see if the user is repeatedly encountering the same errors.
Step 2: Metric Evaluation - Analyze the LINE HISTORY metrics for anomalous behavior. Focus on lines with high activeMs (time spent actively editing), a high churnRatio (indicating code churn), a high churnDeleted count, and any delayOutlier flags. These are strong indicators of struggle on specific lines. Also, consider the overall progressiveSeconds; a long session duration without progress is a sign of struggle.
Step 3: Historical Context - Review the full LINE HISTORY for the lines identified as problematic in the previous step. Does the history show the user rapidly changing the same line of code, or making many edits without meaningful progress? This provides context for the code churn metrics.
Step 4: Synthesize and Decide - Based on the combined evidence from the code, metrics, and history, make a holistic judgment. Is the user experiencing a temporary hiccup or a more significant roadblock? If multiple indicators of struggle are present (e.g., syntax errors, high churn, long delays, no progress over time) and the user's code is not progressing, the user is likely struggling.
Step 5: Formulate Response - Create the final JSON output. The should_call_llm flag must be a boolean (true or false). The reasoning must be a single string that concisely explains the step-by-step analysis that led to the decision. Do not use sub-headers or nested structures within the reasoning string.
 
Few-Shot Examples:
CONTEXT:
codeCode
[2025-09-27T20:25:10.018432] session=a1b2c3d4-e5f6-7890-gh12-i3j4k5l6m7n8
PROMPT:
CURRENT CODE:
def reverse_string(s):
    left = 0
    right = len(s) - 1
    while left < right:
        s[left], s[right] = s[right], s[left]
        left += 1
        right -= 1
    return s
 
print(reverse_string("hello"))
 
METRICS:
- progressiveSeconds: 180
 
LINE HISTORY:
- L1: [ts=5100] 'def reverse_string(s):' {activeMs=4800, idleMs=300, delayMs=250, delayOutlier=False, churnRatio=1.1, churnAdded=22, churnDeleted=2, undoCount=0}
- L2: [ts=15200] '    left = 0' {activeMs=9800, idleMs=300, delayMs=1200, delayOutlier=False, churnRatio=1.0, churnAdded=12, churnDeleted=0, undoCount=0}
- L3: [ts=21000] '    right = len(s) - 1' {activeMs=5500, idleMs=300, delayMs=200, delayOutlier=False, churnRatio=1.2, churnAdded=21, churnDeleted=2, undoCount=0}
- L4: [ts=35000] '    while left < right:' {activeMs=13500, idleMs=500, delayMs=3500, delayOutlier=True, churnRatio=1.5, churnAdded=30, churnDeleted=10, undoCount=1}
- L5: [ts=85000] '        s[left], s[right] = s[right], s[left]' {activeMs=48000, idleMs=2000, delayMs=8500, delayOutlier=True, churnRatio=3.8, churnAdded=115, churnDeleted=85, undoCount=4}
- L6: [ts=91000] '        left += 1' {activeMs=5800, idleMs=200, delayMs=150, delayOutlier=False, churnRatio=1.0, churnAdded=15, churnDeleted=0, undoCount=0}
- L7: [ts=96000] '        right -= 1' {activeMs=4900, idleMs=100, delayMs=120, delayOutlier=False, churnRatio=1.0, churnAdded=16, churnDeleted=0, undoCount=0}
- L8: [ts=101500] '    return s' {activeMs=5300, idleMs=200, delayMs=180, delayOutlier=False, churnRatio=1.1, churnAdded=11, churnDeleted=1, undoCount=0}
 
RECENT RUNS (last 3):
- ts=1759004550000.0
  output:
  error:
🔴 Type Error:
  File "/work/main.py", line 9, in <module>
    print(reverse_string("hello"))
  File "/work/main.py", line 5, in reverse_string
    s[left], s[right] = s[right], s[left]
TypeError: 'str' object does not support item assignment
 
- ts=1759004610000.0
  output:
  error:
🔴 Type Error:
  File "/work/main.py", line 9, in <module>
    print(reverse_string("hello"))
  File "/work/main.py", line 5, in reverse_string
    s[left], s[right] = s[right], s[left]
TypeError: 'str' object does not support item assignment
RESPONSE:
codeJSON
{
  "should_call_llm": true,
  "reasoning": "Step 1: Code Analysis - The user is attempting to solve a string reversal problem using a two-pointer approach. The overall algorithm is logically sound for a mutable sequence, but it fails because Python strings are immutable. The repeated `TypeError: 'str' object does not support item assignment` in recent runs confirms the user is stuck on this fundamental, language-specific concept and cannot progress. Step 2: Metric Evaluation - The metrics show extreme struggle on Line 5, the swapping implementation. It has a very high `churnRatio` of 3.8, a high `undoCount` of 4, and a `delayOutlier` flag, indicating the user spent a significant amount of time (nearly 50 seconds of active time) rewriting this single line without success. A delay outlier on the `while` loop condition on Line 4 also suggests initial uncertainty with the logic. Step 3: Historical Context - The history of Line 5, with its high churn and undo counts, strongly implies the user tried multiple ways to write the swap, failing each time due to the underlying immutability issue. Step 4: Synthesize and Decide - [2025-09-27T20:30:15.021589] session=b2c3d4e5-f6g7-8901-hi23-j4k5l6m7n8o9
PROMPT:
CURRENT CODE:
def two_sum(nums, target):
    num_map = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in num_map:
            return [num_map[complement], i]
        num_map[num] = i
    return []
 
print(two_sum([2, 7, 11, 15], 9))
 
METRICS:
- progressiveSeconds: 210
 
LINE HISTORY:
- L1: [ts=6200] 'def two_sum(nums, target):' {activeMs=5900, idleMs=300, delayMs=280, delayOutlier=False, churnRatio=1.05, churnAdded=28, churnDeleted=1, undoCount=0}
- L2: [ts=18300] '    num_map = {}' {activeMs=11800, idleMs=300, delayMs=1100, delayOutlier=False, churnRatio=1.0, churnAdded=16, churnDeleted=0, undoCount=0}
- L3: [ts=31500] '    for i, num in enumerate(nums):' {activeMs=12900, idleMs=300, delayMs=1500, delayOutlier=False, churnRatio=1.2, churnAdded=35, churnDeleted=4, undoCount=0}
- L4: [ts=41000] '        complement = target - num' {activeMs=9200, idleMs=300, delayMs=250, delayOutlier=False, churnRatio=1.0, churnAdded=30, churnDeleted=0, undoCount=0}
- L5: [ts=55000] '        if complement in num_map:' {activeMs=13700, idleMs=300, delayMs=1200, delayOutlier=False, churnRatio=1.1, churnAdded=32, churnDeleted=3, undoCount=0}
- L6: [ts=64000] '            return [num_map[complement], i]' {activeMs=8800, idleMs=200, delayMs=180, delayOutlier=False, churnRatio=1.0, churnAdded=38, churnDeleted=0, undoCount=0}
- L7: [ts=75000] '        num_map[num] = i' {activeMs=10800, idleMs=200, delayMs=150, delayOutlier=False, churnRatio=1.0, churnAdded=22, churnDeleted=0, undoCount=0}
- L8: [ts=81000] '    return []' {activeMs=5900, idleMs=100, delayMs=120, delayOutlier=False, churnRatio=1.0, churnAdded=12, churnDeleted=0, undoCount=0}
 
RECENT RUNS (last 3):
- ts=1759004990000.0
  output:
    [0, 1]
  error:
 
- ts=1759005015000.0
  output:
    [0, 1]
  error:
RESPONSE:
codeJSON
{
  "should_call_llm": false,
  "reasoning": "Step 1: Code Analysis - The user has implemented a correct and efficient hash map (dictionary) solution for the 'Two Sum' problem. The code is clean, follows Python conventions, and handles the logic perfectly. The recent runs are successful, producing the correct output `[0, 1]` without any errors. Step 2: Metric Evaluation - All metrics indicate a smooth and confident coding session. The `churnRatio` is consistently low across all lines (between 1.0 and 1.2), and the number of `churnDeleted` characters is minimal, suggesting very few typos or corrections. There are no `delayOutlier` flags or `undoCount` events, which means the user did not get stuck or hesitate significantly. Step 3: Historical Context - The line history shows a logical, linear progression. The user defined the function, initialized the dictionary, built the loop, implemented the core logic, and added the return statements in a clear, step-by-step manner without backtracking. Step 4: Synthesize and Decide - The combination of correct code, successful test runs, and uniformly positive metrics demonstrates that the user has a strong grasp of the problem and is making excellent progress. There is no evidence of struggle; therefore, no intervention is required."
}
The user understands the abstract algorithm but is blocked by a core language feature. The combination of a persistent `TypeError` and clear metric-based evidence of intense struggle on the specific line causing the error indicates they need help. An LLM can effectively explain string immutability and provide the correct Pythonic solutions (e.g., converting to a list or building a new string), making intervention highly appropriate."
}
 
Output Format:
Your response MUST follow this two-part structure:
Part 1: Step-by-Step Thinking
Write out your analysis by following the thinking process steps below. Use headers for each step (e.g., "Step 1: Code Analysis"). Be as verbose as necessary to explain your reasoning.
Part 2: Final JSON Output
After your written analysis, provide a single JSON object. This JSON object MUST NOT be preceded by any text (like "Here is the JSON:") and must strictly conform to the schema below.
Final JSON Output Schema:
codeJSON
{
  "type": "object",
  "properties": {
    "should_call_llm": {
      "description": "A boolean indicating if the LLM should be called. Use null in case of an internal processing error.",
      "type": ["boolean", "null"]
    },
    "reasoning": {
      "description": "A single string that concisely summarizes the step-by-step analysis. In case of an error, it must start with 'ERROR: '.",
      "type": "string"
    }
  },
  "required": ["should_call_llm", "reasoning"]
}"""
    
    # Print full prompts to backend stdout for visibility during development
    try:
        print("\n================ SYSTEM PROMPT ================\n")
        print(system_prompt)
        print("\n================= USER PROMPT =================\n")
        print(prompt)
        print("\n===============================================\n")
    except Exception:
        pass

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


async def generate_text_response_patch(patch_text: str, session_id: Optional[str], metrics_patch: Optional[dict] = None, question_json: Optional[dict] = None) -> str:
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

    return await generate_text_response_full(code, session_id, merged_metrics, question_json)


