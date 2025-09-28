from flask import Flask, request, jsonify
from flask_cors import CORS
from langchain_google_genai import GoogleGenerativeAI
import os
from datetime import datetime
import uuid
import asyncio
from pathlib import Path
from typing import List, Optional, Tuple
import re
import json

try:
    from ai_backend.app.db.node_mongo import find_session_by_id as _find_session_by_id_async  # type: ignore
except Exception:
    _find_session_by_id_async = None  # type: ignore

try:
    from ai_backend.app.utils.llm_logger import _get_log_path as _slm_log_path  # type: ignore
except Exception:
    _slm_log_path = None  # type: ignore

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

# Get API key from environment variable
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("Warning: GEMINI_API_KEY not found in environment variables")
    print("Please set your Gemini API key: export GEMINI_API_KEY='your_key_here'")
    exit(1)
else:
    print(f"🔑 Gemini Chat Backend using API key: {api_key[:10]}...{api_key[-4:]}")

# Configure LLM with optimized parameters for chat
llm = GoogleGenerativeAI(
    model="gemini-2.5-flash",  # Updated to latest model
    google_api_key=api_key,
    temperature=0.7,  # Balanced creativity and consistency
    max_output_tokens=1024,  # Reasonable response length
    top_p=0.8,
    top_k=40,
    candidate_count=1,
    stop_sequences=None,
    safety_settings=None,
    generation_config=None
)


# -------------------- Simple in-memory session, queue, and outbox --------------------
PRIORITY = {
    'USER_SPEECH': 3,
    'CODE_RUN': 2,
    'SLM': 1,
}


def _get_session(session_id: str):
    if not hasattr(app, 'chat_sessions'):
        app.chat_sessions = {}
    sess = app.chat_sessions.get(session_id)
    if not sess:
        sess = {
            'messages': [],
            'question_json': None,
            'help_level': 0,
            'struggle_score': 0,
            'queue': [],
            'processing': False,
            'outbox': [],
        }
        app.chat_sessions[session_id] = sess
    return sess


def _append_assistant_message(session, text: str):
    msg = {
        'role': 'assistant',
        'content': text,
        'timestamp': datetime.utcnow().isoformat()
    }
    session['messages'].append(msg)
    session['outbox'].append(msg)


def _enqueue_event(session, event: dict):
    etype = event.get('type') or 'SLM'
    priority = PRIORITY.get(etype, 0)
    # normalize event shape
    session['queue'].append({
        'priority': priority,
        'type': etype,
        'userMessage': event.get('userMessage'),
        'code': event.get('code'),
        'runOutput': event.get('output'),
        'runError': event.get('error'),
        'timestamp': datetime.utcnow().isoformat(),
    })


def _dequeue_highest_priority(session):
    if not session['queue']:
        return None
    session['queue'].sort(key=lambda e: e['priority'], reverse=True)
    return session['queue'].pop(0)


def _build_prompt_from_context(session, user_message: Optional[str], current_code: Optional[str]) -> str:
    history = session['messages'][-10:]
    conversation_history = "\n".join([
        f"{'User' if m['role']=='user' else 'Assistant'}: {m['content']}" for m in history
    ])
    system_context = _innov8_interviewer_system_prompt()
    help_level = int(session.get('help_level') or 0)
    struggle_score = int(session.get('struggle_score') or 0)
    parts: List[str] = [
        system_context,
        "",
        f"SESSION MEMORY:\n- help_level: {help_level}\n- struggle_score: {struggle_score}",
        "",
    ]
    if session.get('question_json'):
        parts.append("QUESTION JSON:")
        try:
            parts.append(json.dumps(session['question_json'], ensure_ascii=False, indent=2))
        except Exception:
            parts.append(str(session['question_json']))
        parts.append("")
    if conversation_history:
        parts.append(f"Previous conversation:\n{conversation_history}\n")
    if current_code:
        parts.append("CURRENT CODE:")
        parts.append(current_code)
        parts.append("")
    # Enrich with recent runs and line history if possible
    try:
        recent_runs_section = _fetch_recent_runs_from_mongo(session.get('session_id'), limit=3)
        if recent_runs_section:
            parts.extend([""] + recent_runs_section + [""])
    except Exception:
        pass
    try:
        line_history_section = _fetch_line_history_compact(session.get('session_id'), max_lines=50)
        if line_history_section:
            parts.extend([""] + line_history_section + [""])
    except Exception:
        pass
    if user_message:
        parts.append(f"Current user message: {user_message}\n\nRespond now following the required format and rules above:")
    else:
        parts.append("Provide helpful, constructive commentary or a short question to guide the student.\n\nRespond now following the required format and rules above:")
    return "\n".join(parts)


def _process_queue(session_id: str):
    session = _get_session(session_id)
    if session['processing']:
        return
    session['processing'] = True
    try:
        while True:
            event = _dequeue_highest_priority(session)
            if not event:
                break
            user_message = event.get('userMessage')
            current_code = event.get('code') or _read_last_slm_current_code() or None
            prompt = _build_prompt_from_context(session, user_message=user_message, current_code=current_code)
            try:
                response_text_raw = llm.invoke(prompt)
            except Exception as e:
                response_text_raw = f"(internal error processing {event.get('type')}) {e}"
            # Update memory from snapshot if available
            try:
                parsed_help, parsed_struggle = _extract_memory_from_snapshot_section(response_text_raw or "")
                if parsed_help is not None:
                    session['help_level'] = max(0, min(3, int(parsed_help)))
                if parsed_struggle is not None:
                    session['struggle_score'] = max(0, min(100, int(parsed_struggle)))
            except Exception:
                pass
            # Append to messages and outbox
            _append_assistant_message(session, response_text_raw)
    finally:
        session['processing'] = False


def _run_async(coro):
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(coro)
        finally:
            loop.close()


def _get_llm_log_path() -> Path:
    if _slm_log_path is not None:
        try:
            return _slm_log_path()
        except Exception:
            pass
    return Path("/home/saksh/coding/hack/ai_backend/tmp/llm_responses.log")


def _read_last_slm_outputs(limit: int = 5, max_chars_per_output: int = 2000) -> List[str]:
    try:
        log_path = _get_llm_log_path()
        if not log_path.exists():
            return []
        text = log_path.read_text(encoding="utf-8", errors="ignore")
        sep = "-" * 80
        blocks = [b.strip() for b in text.split(sep) if b.strip()]
        results: List[str] = []
        for blk in reversed(blocks):
            header_end = blk.find("\n")
            header_line = blk[:header_end] if header_end != -1 else blk
            marker = "\nRESPONSE:\n"
            idx = blk.find(marker)
            if idx == -1:
                continue
            resp = blk[idx + len(marker):].strip()
            if len(resp) > max_chars_per_output:
                resp = resp[:max_chars_per_output] + "…"
            pretty = f"{header_line}\n{resp}"
            results.append(pretty)
            if len(results) >= limit:
                break
        return list(reversed(results))
    except Exception:
        return []


def _read_last_slm_current_code(max_chars: int = 4000) -> Optional[str]:
    """Extract the most recent CURRENT CODE from the SLM log's PROMPT section.

    Reads the dev log written by ai_backend/app/utils/llm_logger.py and pulls the
    CURRENT CODE block from the last entry. Returns None if not found.
    """
    try:
        log_path = _get_llm_log_path()
        if not log_path.exists():
            return None
        text = log_path.read_text(encoding="utf-8", errors="ignore")
        sep = "-" * 80
        blocks = [b for b in text.split(sep) if b.strip()]
        for blk in reversed(blocks):
            # Find PROMPT section
            p_marker = "\nPROMPT:\n"
            r_marker = "\nRESPONSE:\n"
            p_idx = blk.find(p_marker)
            r_idx = blk.find(r_marker)
            if p_idx == -1 or r_idx == -1 or r_idx <= p_idx:
                continue
            prompt_text = blk[p_idx + len(p_marker):r_idx]
            # Within prompt, find CURRENT CODE
            cc_marker = "CURRENT CODE:\n"
            cc_idx = prompt_text.find(cc_marker)
            if cc_idx == -1:
                continue
            after = prompt_text[cc_idx + len(cc_marker):]
            # Stop at METRICS or a heading-like section, or end
            stop_markers = ["\nMETRICS:\n", "\nRECENT RUNS", "\nLINE HISTORY:", "\nQUESTION:", "\nLATEST METRICS:"]
            stop_pos = len(after)
            for sm in stop_markers:
                si = after.find(sm)
                if si != -1:
                    stop_pos = min(stop_pos, si)
            code_block = after[:stop_pos].strip()
            if code_block:
                if len(code_block) > max_chars:
                    code_block = code_block[:max_chars] + "…"
                return code_block
        return None
    except Exception:
        return None

def _get_gemini_log_path() -> Path:
    try:
        base_dir = Path(__file__).resolve().parent
        log_dir = base_dir / "tmp"
        log_dir.mkdir(parents=True, exist_ok=True)
        return log_dir / "gemini_chat.log"
    except Exception:
        return Path("/home/saksh/coding/hack/tmp/gemini_chat.log")


def _append_gemini_prompt_response(prompt: str, response: str, session_id: Optional[str], extracted_json: Optional[str] = None) -> None:
    try:
        timestamp = datetime.utcnow().isoformat()
        sid = session_id or "-"
        separator = "=" * 80
        log_path = _get_gemini_log_path()
        with log_path.open("a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] session={sid}\n")
            f.write("PROMPT:\n")
            f.write(f"{prompt}\n\n")
            f.write("RESPONSE:\n")
            f.write(f"{response}\n")
            f.write("\nEXTRACTED_JSON:\n")
            if extracted_json and extracted_json.strip():
                f.write(f"{extracted_json}\n")
            else:
                f.write("(none)\n")
            f.write(f"{separator}\n")
    except Exception:
        # Best-effort logging only
        pass


def _get_gemini_io_log_path() -> Path:
    try:
        base_dir = Path(__file__).resolve().parent
        return base_dir / "gemini_chat_io.log"
    except Exception:
        return Path("/home/saksh/coding/hack/gemini_chat_io.log")


def _append_gemini_io_log(prompt: str, response: str, session_id: Optional[str]) -> None:
    try:
        timestamp = datetime.utcnow().isoformat()
        sid = session_id or "-"
        sep = "-" * 80
        log_path = _get_gemini_io_log_path()
        with log_path.open("a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] session={sid}\n")
            f.write("PROMPT:\n")
            f.write(prompt)
            f.write("\n\nOUTPUT:\n")
            f.write(response)
            f.write("\n")
            f.write(sep)
            f.write("\n")
    except Exception:
        pass

def _map_help_label_to_level(label: str) -> int:
    try:
        norm = (label or "").strip().lower()
        if not norm:
            return 0
        if "direction" in norm:
            return 3
        if "guide" in norm:
            return 2
        if "nudge" in norm:
            return 1
        if "self" in norm or "sufficient" in norm or "no hint" in norm:
            return 0
    except Exception:
        pass
    return 0


def _extract_memory_from_snapshot_section(text: str) -> Tuple[Optional[int], Optional[int]]:
    """Parse the '### Interview Snapshot' section to get help_level and struggle_score.

    Returns (help_level, struggle_score) where either can be None if not found.
    """
    try:
        if not text:
            return (None, None)
        marker = "### Interview Snapshot"
        idx = text.find(marker)
        if idx == -1:
            return (None, None)
        tail = text[idx + len(marker):]
        end_idx = tail.find("### ")
        section = tail if end_idx == -1 else tail[:end_idx]
        help_level_val: Optional[int] = None
        struggle_val: Optional[int] = None
        for line in section.splitlines():
            l = line.strip()
            if not l:
                continue
            if "help tier" in l.lower() and ":" in l:
                try:
                    label = l.split(":", 1)[1].strip()
                    help_level_val = _map_help_label_to_level(label)
                except Exception:
                    pass
            if "struggle score" in l.lower() and ":" in l:
                try:
                    right = l.split(":", 1)[1]
                    digits = "".join(ch for ch in right if ch.isdigit())
                    if digits:
                        struggle_val = max(0, min(100, int(digits)))
                except Exception:
                    pass
        return (help_level_val, struggle_val)
    except Exception:
        return (None, None)


def _innov8_interviewer_system_prompt() -> str:
    return ("""System Prompt for Conversational Coding Interviewer (JSON Output)
You are "Innov8," an expert and empathetic AI technical interviewer. Your primary goal is to guide a student through a Data Structures and Algorithms (DSA) coding interview, simulating a real, supportive, and insightful human interaction. You will be conducting this interview via an audio-based conversational interface.
Your task is to analyze a comprehensive context package and generate a single, structured JSON response containing the exact text to be spoken aloud.
1. Your Persona & Guiding Principles
Be a Human Mentor, Not a Robot: Sound encouraging, patient, and respectful. Use conversational language. Start with phrases like "That's a good start," or "I see what you're thinking."
Probe, Don't Preach: Your main tool is the follow-up question. Ask questions that make the student think about their own code and logic. Avoid generic or unactionable fluff like "Good job!" or "Keep trying!"
Never Expose Your Inner Workings: Do not mention help_level, struggle_score, or your internal logic directly to the user. These are for your reasoning only.
Be Concise: The student is focused on coding. Keep your verbal responses clear and to the point.
2. Input Context You Will Receive Each Turn
You will be given the following data package to inform your response. You must use all of it to make the best decision.
SESSION MEMORY:
help_level: An integer from 0 to 3 indicating how much help the student currently needs.
struggle_score: An integer from 0 to 100 quantifying how much the student is struggling.
CRITICAL: You MUST use these values as provided. DO NOT track or update them yourself.
QUESTION JSON: Contains everything about the problem, including hint_templates for Nudge, Guide, and Direction levels. You will use these to formulate your hints.
LATEST USER MESSAGE & CURRENT CODE: The student's most recent message and their up-to-date code.
BEHAVIORAL METRICS & ANALYSIS: Data like churnRatio, delayMs, and undoCount. Use this to gauge the user's state (flow, thinking, or stuck).
CONVERSATION HISTORY: The transcript of your conversation so far.
3. Your Interaction Logic (Follow these steps)
Analyze the Situation: Synthesize all inputs to understand the student's current state.
Decide Your Follow-up Stance: Based on your analysis, decide whether to ask a deeper probing question (if they are succeeding) or a clarifying question (if they are struggling).
Mentally Construct the Full Response: In your reasoning process, you should first build a complete response using the detailed markdown structure from your instructions (Follow-up Question, Hint Block, Snapshot, Next Steps). This markdown is for your internal logic only and will not be in your final output.
Check for Difficulty Adjustment: If help_level is 3 and struggle_score is 70 or higher, prepare to switch to an easier problem. Your spoken response should gently explain this adjustment.
Synthesize the Spoken Response: From your mentally constructed markdown, extract and rephrase the key parts into a natural, conversational script.
Format the Final Output: Place the conversational script into the final JSON structure.
4. Required Output Format (Strictly Adhere to this JSON Structure)
Your entire output MUST be a single, valid JSON object with exactly one key: output_chat. The value of this key must be a string containing the text to be read aloud.
How to create the output_chat string:
Start with the Follow-up Question: This is the core of your message.
Mention the Hint (If available): If help_level >= 1, add a natural phrase like, "If you'd like a hint, just let me know." or "I have a nudge ready for you if you get stuck." Do not read the hint itself.
State the Next Steps: Convert the "Next Steps" list into a conversational sentence. For example, "For your next steps, I'd suggest focusing on..."
Add Encouragement: End with a short, supportive sentence.
Absolutely NO Markdown: The string must not contain ###, *, <details>, or any other markdown formatting.
Absolutely NO Internal Metrics: Do not mention the "Interview Snapshot," "help tier," or "struggle score."
Example Walkthrough:
Step 1: Your Internal Thought Process (Mental Markdown)
code
Markdown
### Follow-up Question
That's an interesting approach. What do you think the time complexity of your current solution is, and why?

<details>
  <summary><strong>Nudge (Score: 34/100)</strong></summary>
  A brute-force approach would be to check every pair of numbers. How can you make the lookup for the second number faster than a linear scan?
</details>

### Interview Snapshot
*   **Help tier:** Nudge
*   **Struggle score:** 20
*   **Next escalation gate:** If you're still stuck, I can provide a more direct guide on the overall approach.

### Next Steps
1.  Think about a data structure that allows for very fast lookups.
2.  Explain how you might use it to solve this problem more efficiently.

Let's take a moment to think about the efficiency. You're on the right track!
Step 2: Your Final JSON Output (What you actually produce)
code
JSON
{
  "output_chat": "That's an interesting approach. What do you think the time complexity of your current solution is, and why? I have a small nudge ready if you need it. For your next steps, try to think about a data structure that allows for very fast lookups and how you might use it here. You're on the right track!"
}
""" )


def _extract_output_chat(text: str) -> Optional[str]:
    """Extract the output_chat string from a model response that should be JSON.

    Tries direct parse, then searches for an embedded JSON object containing
    an "output_chat" key. Returns None if not found/parsable.
    """
    try:
        # Direct parse first
        obj = json.loads(text)
        if isinstance(obj, dict) and isinstance(obj.get("output_chat"), str):
            return obj.get("output_chat")
    except Exception:
        pass
    # Try to extract fenced or inline JSON containing output_chat
    try:
        # Common code-fence capture
        m = re.search(r"```(?:json|JSON)?\s*(\{[\s\S]*?\})\s*```", text)
        if m:
            maybe = m.group(1)
            obj = json.loads(maybe)
            if isinstance(obj, dict) and isinstance(obj.get("output_chat"), str):
                return obj.get("output_chat")
    except Exception:
        pass
    try:
        # Greedy object containing the key
        m2 = re.search(r"(\{[\s\S]*?\"output_chat\"[\s\S]*?\})", text)
        if m2:
            maybe = m2.group(1)
            obj = json.loads(maybe)
            if isinstance(obj, dict) and isinstance(obj.get("output_chat"), str):
                return obj.get("output_chat")
    except Exception:
        pass
    return None


def _extract_output_json_str(text: str) -> Optional[str]:
    """Return a pretty JSON string containing the model's structured output.

    Prefers a JSON object that includes the key "output_chat". Tries several
    strategies similar to _extract_output_chat. If only the output_chat string
    can be recovered, wraps it as {"output_chat": "..."}.
    """
    try:
        obj = json.loads(text)
        if isinstance(obj, dict) and "output_chat" in obj:
            return json.dumps(obj, ensure_ascii=False, indent=2)
    except Exception:
        pass
    try:
        m = re.search(r"```(?:json|JSON)?\s*(\{[\s\S]*?\})\s*```", text)
        if m:
            maybe = m.group(1)
            obj = json.loads(maybe)
            if isinstance(obj, dict) and "output_chat" in obj:
                return json.dumps(obj, ensure_ascii=False, indent=2)
    except Exception:
        pass
    try:
        m2 = re.search(r"(\{[\s\S]*?\"output_chat\"[\s\S]*?\})", text)
        if m2:
            maybe = m2.group(1)
            obj = json.loads(maybe)
            if isinstance(obj, dict) and "output_chat" in obj:
                return json.dumps(obj, ensure_ascii=False, indent=2)
    except Exception:
        pass
    # Fallback: try to extract just the string and wrap it
    try:
        oc = _extract_output_chat(text)
        if isinstance(oc, str):
            return json.dumps({"output_chat": oc}, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return None

def _fetch_recent_runs_from_mongo(session_id: Optional[str], limit: int = 3, max_len: int = 2000) -> List[str]:
    if not session_id or not _find_session_by_id_async:
        return []
    try:
        doc = _run_async(_find_session_by_id_async(session_id))
        if not doc:
            return []
        subs = (doc.get("all_submissions") or [])
        tail = subs[-limit:]
        lines: List[str] = ["RECENT RUNS (last {}):".format(min(limit, len(tail)))]
        for s in tail:
            ts = s.get("timestamp")
            out = (s.get("output") or "").strip()
            err = (s.get("error") or "").strip()
            if len(out) > max_len:
                out = out[:max_len] + "…"
            if len(err) > max_len:
                err = err[:max_len] + "…"
            lines.append(f"- ts={ts}\n  output:\n{out}\n  error:\n{err}")
        return lines
    except Exception:
        return []


def _fetch_line_history_compact(session_id: Optional[str], max_lines: int = 50) -> List[str]:
    if not session_id or not _find_session_by_id_async:
        return []
    try:
        doc = _run_async(_find_session_by_id_async(session_id))
        if not doc:
            return []
        lh = doc.get("lineHistory")
        if not lh:
            return []
        lines: List[str] = ["LINE HISTORY:"]
        count = 0
        # lh can be dict mapping line->list, or list of tuples
        items = lh.items() if isinstance(lh, dict) else (lh or [])
        for line, arr in items:
            try:
                tail = (arr or [])[-3:]
                pretty_entries: List[str] = []
                for e in tail:
                    ts = e.get("timestamp") if isinstance(e, dict) else None
                    content = e.get("content") if isinstance(e, dict) else None
                    metrics_obj = e.get("metrics") if isinstance(e, dict) else None
                    if isinstance(content, str) and len(content) > 100:
                        content_display = content[:100] + "…"
                    else:
                        content_display = content if isinstance(content, str) else ""
                    if isinstance(metrics_obj, dict) and metrics_obj:
                        items_str: List[str] = []
                        for mk, mv in list(metrics_obj.items())[:8]:
                            items_str.append(f"{mk}={mv}")
                        metrics_display = " {" + ", ".join(items_str) + "}"
                    else:
                        metrics_display = ""
                    pretty_entries.append(f"[ts={ts}] '{content_display}'{metrics_display}")
                lines.append(f"- L{line}: " + " | ".join(pretty_entries))
                count += 1
                if count >= max_lines:
                    lines.append("(truncated)")
                    break
            except Exception:
                continue
        return lines
    except Exception:
        return []

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400

        user_message = (data.get('message') or '').strip()
        if not user_message:
            return jsonify({'error': 'Message cannot be empty'}), 400

        # Maintain per-session conversational context
        session_id = data.get('sessionId') or str(uuid.uuid4())
        session = _get_session(session_id)
        session['session_id'] = session_id

        # Append user message
        session['messages'].append({
            'role': 'user',
            'content': user_message,
            'timestamp': datetime.utcnow().isoformat()
        })

        # Optional current code and question context
        current_code = (data.get('code') or '').strip()
        if not current_code:
            # Fallback: try to read the last CURRENT CODE from SLM dev log
            slm_code = _read_last_slm_current_code()
            if slm_code:
                current_code = slm_code
        incoming_question = data.get('questionJson')
        if incoming_question and incoming_question != session.get('question_json'):
            session['question_json'] = incoming_question

        # Build conversation-aware prompt (last 10 turns)
        history = session['messages'][-10:]
        conversation_history = "\n".join([
            f"{'User' if m['role']=='user' else 'Assistant'}: {m['content']}" for m in history
        ])

        system_context = _innov8_interviewer_system_prompt()
        help_level = int(session.get('help_level') or 0)
        struggle_score = int(session.get('struggle_score') or 0)

        # Compose full prompt with question (once), current code, and expanded SLM/Mongo context
        parts = [system_context, "", f"SESSION MEMORY:\n- help_level: {help_level}\n- struggle_score: {struggle_score}", ""]
        if session.get('question_json'):
            parts.append("QUESTION JSON:")
            try:
                import json as _json
                parts.append(_json.dumps(session['question_json'], ensure_ascii=False, indent=2))
            except Exception:
                parts.append(str(session['question_json']))
            parts.append("")
        if conversation_history:
            parts.append(f"Previous conversation:\n{conversation_history}\n")
        if current_code:
            parts.append("CURRENT CODE:")
            parts.append(current_code)
            parts.append("")
        # Enrich with recent runs and line history from Mongo for this session
        try:
            recent_runs_section = _fetch_recent_runs_from_mongo(session_id, limit=3)
            if recent_runs_section:
                parts.extend([""] + recent_runs_section + [""])
        except Exception:
            pass
        try:
            line_history_section = _fetch_line_history_compact(session_id, max_lines=50)
            if line_history_section:
                parts.extend([""] + line_history_section + [""])
        except Exception:
            pass
        # Note: Avoid injecting SLM RECENT OUTPUTS to prevent confusing example contexts
        parts.append(f"Current user message: {user_message}\n\nRespond now following the required format and rules above:")
        full_prompt = "\n".join(parts)

        # Generate response using Gemini
        response_text_raw = llm.invoke(full_prompt)

        # Attempt to update memory state from the Interview Snapshot (use raw response)
        try:
            parsed_help, parsed_struggle = _extract_memory_from_snapshot_section(response_text_raw or "")
            if parsed_help is not None:
                session['help_level'] = max(0, min(3, int(parsed_help)))
            if parsed_struggle is not None:
                session['struggle_score'] = max(0, min(100, int(parsed_struggle)))
        except Exception:
            pass

        # Append assistant response
        session['messages'].append({
            'role': 'assistant',
            'content': response_text_raw,
            'timestamp': datetime.utcnow().isoformat()
        })
        app.chat_sessions[session_id] = session

        # Prefer JSON output if provided by the model; fall back to raw
        output_chat = _extract_output_chat(response_text_raw)
        tts_text = output_chat if isinstance(output_chat, str) and output_chat.strip() else response_text_raw

        # Best-effort file logging of full prompt, raw output, and extracted JSON
        try:
            extracted_json_str = _extract_output_json_str(response_text_raw)
            _append_gemini_prompt_response(full_prompt, response_text_raw, session_id, extracted_json_str)
            _append_gemini_io_log(full_prompt, response_text_raw, session_id)
        except Exception:
            pass
        return jsonify({
            'response': tts_text,
            'rawResponse': response_text_raw,
            'sessionId': session_id,
            'timestamp': datetime.utcnow().isoformat()
        })

    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
        return jsonify({
            'error': 'Failed to process chat message',
            'details': str(e)
        }), 500


@app.route('/events/enqueue', methods=['POST'])
def enqueue_event():
    try:
        data = request.get_json() or {}
        session_id = data.get('sessionId') or str(uuid.uuid4())
        session = _get_session(session_id)
        session['session_id'] = session_id
        # Persist question if provided and changed
        if data.get('questionJson') and data['questionJson'] != session.get('question_json'):
            session['question_json'] = data['questionJson']
        _enqueue_event(session, data)
        _process_queue(session_id)
        return jsonify({ 'ok': True, 'sessionId': session_id })
    except Exception as e:
        return jsonify({ 'ok': False, 'error': str(e) }), 500

@app.route('/chat/events/poll', methods=['GET'])
def chat_events_poll():
    """Return any queued assistant messages (outbox) for a session and clear them.

    Frontend polls this endpoint to fetch nudges/comments produced by background
    events (e.g., SLM triggers, CODE_RUN commentary). Response shape:
    {
      "ok": true,
      "sessionId": "...",
      "count": 2,
      "messages": [ { role, content, timestamp }, ... ]
    }
    """
    try:
        session_id = request.args.get('sessionId') or ''
        if not session_id:
            return jsonify({ 'ok': False, 'error': 'sessionId is required' }), 400
        session = _get_session(session_id)
        outbox = list(session.get('outbox') or [])
        # Clear outbox once delivered
        session['outbox'] = []
        app.chat_sessions[session_id] = session
        return jsonify({ 'ok': True, 'sessionId': session_id, 'count': len(outbox), 'messages': outbox })
    except Exception as e:
        return jsonify({ 'ok': False, 'error': str(e) }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'Gemini AI Chat Backend'})

if __name__ == '__main__':
    print("Starting Gemini AI Chat Backend...")
    print(f"API Key configured: {'Yes' if api_key else 'No'}")
    app.run(host='0.0.0.0', port=5000, debug=True)