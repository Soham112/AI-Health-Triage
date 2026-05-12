"""
All database query functions. Each function is a single-purpose query with typed results.
Uses the DBClient singleton from client.py.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from .client import db

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Member queries
# ---------------------------------------------------------------------------

def get_member(member_id: str) -> Optional[dict]:
    """Returns full member record including conditions, medications, and risk score."""
    def _query():
        return db.client.table("members").select("*").eq("id", member_id).execute()

    try:
        result = db.execute_with_retry(_query)
        return result.data[0] if result.data else None
    except Exception as exc:
        logger.error(f"get_member failed for {member_id}: {exc}")
        return None


def get_member_claims(member_id: str, limit: int = 100) -> list[dict]:
    """Returns member's claims history, most recent first."""
    def _query():
        return (
            db.client.table("claims")
            .select("*")
            .eq("member_id", member_id)
            .order("service_date", desc=True)
            .limit(limit)
            .execute()
        )

    try:
        result = db.execute_with_retry(_query)
        return result.data or []
    except Exception as exc:
        logger.error(f"get_member_claims failed for {member_id}: {exc}")
        return []


# ---------------------------------------------------------------------------
# Triage history
# ---------------------------------------------------------------------------

def get_triage_history(member_id: str, limit: int = 10) -> list[dict]:
    """Past triage assessments with outcomes for context injection."""
    def _query():
        return (
            db.client.table("triage_outcomes")
            .select("*")
            .eq("member_id", member_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

    try:
        result = db.execute_with_retry(_query)
        return result.data or []
    except Exception as exc:
        logger.error(f"get_triage_history failed for {member_id}: {exc}")
        return []


def save_triage_outcome(member_id: str, outcome: dict) -> bool:
    """
    Persist a triage result.
    outcome must include: recommendation, reasoning, confidence, symptoms, cost_analysis
    """
    record = {
        "id": str(uuid.uuid4()),
        "member_id": member_id,
        "recommendation": outcome.get("recommendation"),
        "confidence": outcome.get("confidence"),
        "symptoms": outcome.get("symptoms"),
        "reasoning_summary": outcome.get("reasoning", "")[:500],  # truncate for storage
        "cost_analysis": json.dumps(outcome.get("cost_analysis", {})),
        "created_at": datetime.utcnow().isoformat(),
        "actual_care_used": None,   # filled in by outcome_tracker later
    }

    def _query():
        return db.client.table("triage_outcomes").insert(record).execute()

    try:
        db.execute_with_retry(_query)
        return True
    except Exception as exc:
        logger.error(f"save_triage_outcome failed for {member_id}: {exc}")
        return False


# ---------------------------------------------------------------------------
# Chat history
# ---------------------------------------------------------------------------

def get_chat_history(member_id: str, session_id: Optional[str] = None, limit: int = 20) -> list[dict]:
    """Returns chat messages for a member, optionally filtered by session."""
    def _query():
        q = db.client.table("chat_history").select("*").eq("member_id", member_id)
        if session_id:
            q = q.eq("session_id", session_id)
        return q.order("created_at", desc=False).limit(limit).execute()

    try:
        result = db.execute_with_retry(_query)
        return result.data or []
    except Exception as exc:
        logger.error(f"get_chat_history failed for {member_id}: {exc}")
        return []


def save_chat_message(member_id: str, session_id: str, role: str, content: str) -> bool:
    record = {
        "id": str(uuid.uuid4()),
        "member_id": member_id,
        "session_id": session_id,
        "role": role,
        "content": content[:4000],   # guard against huge messages
        "created_at": datetime.utcnow().isoformat(),
    }

    def _query():
        return db.client.table("chat_history").insert(record).execute()

    try:
        db.execute_with_retry(_query)
        return True
    except Exception as exc:
        logger.error(f"save_chat_message failed for {member_id}: {exc}")
        return False


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

def save_audit_log(
    action: str,
    user_id: str,
    resource: str,
    details: dict,
    success: bool = True,
) -> bool:
    """
    Immutable audit trail. Designed to export to SIEM for HIPAA compliance.
    PII must be redacted before calling this function.
    """
    record = {
        "id": str(uuid.uuid4()),
        "action": action,
        "user_id": user_id,
        "resource": resource,
        "details": json.dumps(details),
        "success": success,
        "timestamp": datetime.utcnow().isoformat(),
        "ip_hash": details.get("ip_hash"),
    }

    def _query():
        return db.client.table("audit_logs").insert(record).execute()

    try:
        db.execute_with_retry(_query)
        return True
    except Exception as exc:
        logger.error(f"save_audit_log failed: {exc}")
        return False


# ---------------------------------------------------------------------------
# Campaign / preventive outreach
# ---------------------------------------------------------------------------

def get_active_campaigns(member_id: str) -> list[dict]:
    def _query():
        return (
            db.client.table("preventive_campaigns")
            .select("*")
            .eq("member_id", member_id)
            .eq("status", "active")
            .execute()
        )

    try:
        result = db.execute_with_retry(_query)
        return result.data or []
    except Exception as exc:
        logger.error(f"get_active_campaigns failed for {member_id}: {exc}")
        return []


def mark_campaign_engaged(campaign_id: str, outcome: str) -> bool:
    def _query():
        return (
            db.client.table("preventive_campaigns")
            .update({"status": "engaged", "outcome": outcome, "engaged_at": datetime.utcnow().isoformat()})
            .eq("id", campaign_id)
            .execute()
        )

    try:
        db.execute_with_retry(_query)
        return True
    except Exception as exc:
        logger.error(f"mark_campaign_engaged failed for {campaign_id}: {exc}")
        return False
