from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes.llm import router as llm_router


app = FastAPI(title="AI Backend")

# CORS for local frontend dev; adjust as needed for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(llm_router, prefix="/api")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("ai_backend.app.main:app", host="0.0.0.0", port=8000, reload=True)


