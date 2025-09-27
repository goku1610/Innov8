import os
from functools import lru_cache

from motor.motor_asyncio import AsyncIOMotorClient


@lru_cache()
def get_node_client() -> AsyncIOMotorClient:
    url = os.getenv("NODE_MONGO_URL", os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    return AsyncIOMotorClient(url)


def get_node_db():
    client = get_node_client()
    return client[os.getenv("NODE_MONGO_DB", "hack")]


async def find_session_by_id(session_id: str):
    db = get_node_db()
    # Session collection name in Node backend
    coll = db["sessions" if "sessions" in await db.list_collection_names() else "sessionmodels"]
    doc = await coll.find_one({"sessionId": session_id})
    return doc


