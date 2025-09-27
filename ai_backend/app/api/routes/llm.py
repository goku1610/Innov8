from fastapi import APIRouter, HTTPException

from ...schemas.llm import GenerateRequest, GenerateResponse
from ...services.llm_service import generate_text_response_full, generate_text_response_patch


router = APIRouter(tags=["llm"], prefix="/llm")


@router.post("/generate", response_model=GenerateResponse)
async def generate_endpoint(payload: GenerateRequest) -> GenerateResponse:
    try:
        mode = (payload.mode or ("patch" if payload.patch else "full")).lower()
        if mode == "full":
            if not payload.code:
                raise HTTPException(status_code=400, detail="code is required for mode=full")
            response_text = await generate_text_response_full(payload.code, payload.session_id, payload.metrics or {})
        elif mode == "patch":
            if not payload.patch:
                raise HTTPException(status_code=400, detail="patch is required for mode=patch")
            response_text = await generate_text_response_patch(payload.patch, payload.session_id, payload.metrics_patch or {})
        else:
            raise HTTPException(status_code=400, detail="mode must be 'full' or 'patch'")

        return GenerateResponse(response=response_text)
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - simple surface error mapping
        raise HTTPException(status_code=500, detail=str(exc))


