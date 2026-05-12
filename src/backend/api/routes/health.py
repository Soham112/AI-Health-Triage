"""
GET /api/backend/health/{member_id}
POST /api/backend/outcomes/{member_id}

Full health profile endpoint — risk score + claims analysis + outcome tracking.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Path

from src.backend.scoring.risk_calculator import calculate_risk
from src.backend.scoring.claims_analyzer import analyze_claims
from src.backend.agents.outcome_tracker import run_outcome_tracking
from src.backend.database.queries import get_member, get_member_claims

logger = logging.getLogger(__name__)
router = APIRouter()

_MEMBER_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-]{1,50}$")


def _validate_member_id(member_id: str) -> None:
    if not _MEMBER_ID_PATTERN.match(member_id):
        raise HTTPException(status_code=422, detail="Invalid member_id format")


@router.get("/health/{member_id}")
async def get_health_profile(
    member_id: str = Path(..., description="Member identifier"),
):
    """
    Returns a full health intelligence profile:
    - Current risk score with breakdown
    - Claims analysis summary
    - Preventive opportunities ranked by ROI
    """
    _validate_member_id(member_id)
    logger.info(f"Health profile request: member={member_id}")

    member = get_member(member_id)
    if not member:
        raise HTTPException(status_code=404, detail=f"Member {member_id} not found")

    claims = get_member_claims(member_id, limit=100)

    risk = calculate_risk(
        member_id=member_id,
        age=member.get("age", 40),
        conditions=member.get("conditions", []),
        medications=member.get("medications", []),
        claims=claims,
        social_risk_flags=member.get("social_risk_flags", []),
    )

    analysis = analyze_claims(member_id, claims)

    return {
        "member_id": member_id,
        "member": {
            "name": member.get("name"),
            "age": member.get("age"),
            "conditions": member.get("conditions", []),
            "condition_label": member.get("condition_label"),
            "medications": member.get("medications", []),
            "plan_type": member.get("plan_type"),
        },
        "risk_score": {
            "overall_risk": risk.overall_risk,
            "tier": risk.tier,
            "predicted_annual_cost": risk.predicted_annual_cost,
            "confidence": risk.confidence,
            "breakdown": risk.breakdown,
            "risk_factors": [
                {
                    "name": f.name,
                    "score_contribution": f.score_contribution,
                    "description": f.description,
                }
                for f in risk.risk_factors
            ],
        },
        "claims_summary": {
            "total_cost": analysis.total_cost,
            "claim_count": analysis.claim_count,
            "er_visit_count": analysis.er_visit_count,
            "hospitalization_count": analysis.hospitalization_count,
            "chronic_conditions": analysis.chronic_conditions,
            "date_range": analysis.date_range,
        },
        "preventive_opportunities": [
            {
                "intervention": o.intervention,
                "estimated_annual_savings": o.estimated_annual_savings,
                "priority": o.priority,
                "evidence_base": o.evidence_base,
            }
            for o in risk.preventive_opportunities
        ],
        "care_patterns": [
            {
                "type": p.pattern_type,
                "description": p.description,
                "severity": p.severity,
            }
            for p in analysis.patterns
        ],
    }


@router.post("/outcomes/{member_id}")
async def get_outcomes(
    member_id: str = Path(..., description="Member identifier"),
):
    """Runs the outcome tracking agent and returns engagement + cost impact summary."""
    _validate_member_id(member_id)
    logger.info(f"Outcome tracking request: member={member_id}")

    result = run_outcome_tracking(member_id=member_id)

    if result.get("error"):
        raise HTTPException(status_code=500, detail=result["error"])

    return result
