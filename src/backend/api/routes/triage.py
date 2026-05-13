"""POST /api/backend/triage — runs the LangGraph triage agent."""

from __future__ import annotations

import hashlib
import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from src.backend.agents.triage_agent import run_triage
from src.backend.safety.input_validation import validate_symptoms, ValidationResult

logger = logging.getLogger(__name__)
router = APIRouter()


class TriageRequest(BaseModel):
    symptoms: str = Field(..., min_length=3, max_length=2000)
    severity: Literal["low", "medium", "high"] = "medium"
    member_id: str = Field(..., min_length=1, max_length=50)

    @field_validator("member_id")
    @classmethod
    def sanitize_member_id(cls, v: str) -> str:
        # Only allow alphanumeric + dash/underscore — prevent injection via member_id path
        import re
        if not re.match(r"^[A-Za-z0-9_\-]{1,50}$", v):
            raise ValueError("Invalid member_id format")
        return v


class TriageResponse(BaseModel):
    recommendation: Optional[str]
    reasoning: str
    confidence: float
    red_flags: list[str]
    cost_analysis: dict
    thinking: Optional[str]
    risk_score: Optional[dict]
    triage_history: list[dict]
    kb_match: Optional[dict]   # top KB rule that fired: entry_id, decision, sources
    error: Optional[str]


@router.post("/triage", response_model=TriageResponse)
async def triage_endpoint(request: Request, body: TriageRequest):
    # Pre-validation before hitting the agent
    validation = validate_symptoms(body.symptoms)
    if not validation.valid:
        if validation.result == ValidationResult.SELF_HARM:
            # Return 200 with crisis resource — do not 4xx a person in crisis
            return TriageResponse(
                recommendation=None,
                reasoning=validation.reason,
                confidence=1.0,
                red_flags=["self_harm_language_detected"],
                cost_analysis={},
                thinking=None,
                risk_score=None,
                triage_history=[],
                error=None,
            )
        raise HTTPException(status_code=422, detail=validation.reason)

    # Use redacted symptoms if PII was found
    clean_symptoms = validation.redacted_input or body.symptoms

    logger.info(f"Triage request: member={body.member_id} severity={body.severity}")

    result = run_triage(
        symptoms=clean_symptoms,
        severity=body.severity,
        member_id=body.member_id,
    )

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return TriageResponse(
        recommendation=result.get("recommendation"),
        reasoning=result.get("reasoning", ""),
        confidence=result.get("confidence", 0.0),
        red_flags=result.get("red_flags", []),
        cost_analysis=result.get("cost_analysis", {}),
        thinking=result.get("thinking"),
        risk_score=result.get("risk_score"),
        triage_history=result.get("triage_history", []),
        kb_match=result.get("kb_match"),
        error=result.get("error"),
    )
