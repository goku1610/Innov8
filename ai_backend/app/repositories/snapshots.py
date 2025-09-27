from datetime import datetime
from typing import Any, Dict, Optional

from ..db.mongo import get_db


async def insert_snapshot(document: Dict[str, Any]) -> str:
    db = get_db()
    coll = db["snapshots"]
    doc = dict(document)
    doc.setdefault("created_at", datetime.utcnow())
    result = await coll.insert_one(doc)
    return str(result.inserted_id)


async def get_last_snapshot_by_session(session_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    coll = db["snapshots"]
    doc = await coll.find_one({"session_id": session_id}, sort=[("created_at", -1)])
    return doc


async def get_snapshots_by_session(session_id: str, limit: int = 500) -> list[Dict[str, Any]]:
    """Fetch snapshots for a session in chronological order (oldest to newest)."""
    db = get_db()
    coll = db["snapshots"]
    cursor = coll.find({"session_id": session_id}).sort("created_at", 1).limit(limit)
    return [doc async for doc in cursor]


async def count_snapshots_by_session(session_id: str) -> int:
    db = get_db()
    coll = db["snapshots"]
    return await coll.count_documents({"session_id": session_id})


