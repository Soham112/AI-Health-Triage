"""POST /api/backend/claims — runs the LangGraph claims analysis agent."""

from __future__ import annotations

import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from src.backend.agents.claims_agent import run_claims_analysis

logger = logging.getLogger(__name__)
router = APIRouter()


class ClaimsRequest(BaseModel):
    member_id: str = Field(..., min_length=1, max_length=50)

    @field_validator("member_id")
    @classmethod
    def sanitize_member_id(cls, v: str) -> str:
        if not re.match(r"^[A-Za-z0-9_\-]{1,50}$", v):
            raise ValueError("Invalid member_id format")
        return v


class ClaimsResponse(BaseModel):
    campaigns: list[dict]
    patterns_found: list[str]
    projected_savings: float
    roi_analysis: dict
    risk_score: Optional[dict]
    error: Optional[str]


@router.post("/claims", response_model=ClaimsResponse)
async def claims_endpoint(body: ClaimsRequest):
    logger.info(f"Claims analysis request: member={body.member_id}")

    result = run_claims_analysis(member_id=body.member_id)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return ClaimsResponse(
        campaigns=result.get("campaigns", []),
        patterns_found=result.get("patterns_found", []),
        projected_savings=result.get("projected_savings", 0.0),
        roi_analysis=result.get("roi_analysis", {}),
        risk_score=result.get("risk_score"),
        error=None,
    )
