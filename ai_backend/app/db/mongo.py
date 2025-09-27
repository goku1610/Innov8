import os
from functools import lru_cache

from motor.motor_asyncio import AsyncIOMotorClient


@lru_cache()
def get_client() -> AsyncIOMotorClient:
    url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    return AsyncIOMotorClient(url)


def get_db():
    client = get_client()
    return client[os.getenv("MONGO_DB", "hack_ai")]


