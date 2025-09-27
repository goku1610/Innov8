from datetime import datetime
from pathlib import Path
from typing import Optional


def _get_log_path() -> Path:
    base_dir = Path(__file__).resolve().parents[2]  # points to ai_backend/
    tmp_dir = base_dir / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    return tmp_dir / "llm_responses.log"


def append_prompt_response(prompt: str, response: str, session_id: Optional[str] = None, system_prompt: Optional[str] = None) -> None:
    """Append a prompt/response pair to a temp log file with a timestamp.

    This is intended for temporary, best-effort logging during development.
    """
    timestamp = datetime.utcnow().isoformat()
    sid = session_id or "-"
    separator = "-" * 80

    log_path = _get_log_path()
    with log_path.open("a", encoding="utf-8") as f:
        f.write(f"[{timestamp}] session={sid}\n")
        if system_prompt:
            f.write("SYSTEM PROMPT:\n")
            f.write(f"{system_prompt}\n\n")
        f.write("PROMPT:\n")
        f.write(f"{prompt}\n\n")
        f.write("RESPONSE:\n")
        f.write(f"{response}\n")
        f.write(f"{separator}\n")


