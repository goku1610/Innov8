from typing import Optional

from pydantic import BaseModel


class GenerateRequest(BaseModel):
    # Either send full code or a patch; session_id is used to resolve previous code
    session_id: Optional[str] = None
    mode: Optional[str] = None  # 'full' or 'patch' (optional)
    code: Optional[str] = None  # required when mode=='full'
    patch: Optional[str] = None  # required when mode=='patch'
    metrics: Optional[dict] = None  # present in full mode
    metrics_patch: Optional[dict] = None  # present in patch mode


class GenerateResponse(BaseModel):
    response: str


