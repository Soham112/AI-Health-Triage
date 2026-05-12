"""
LangGraph outcome tracking agent.

Monitors whether triage recommendations were followed, tracks actual care used
vs. recommended, calculates real cost savings, and updates risk scores based
on intervention outcomes. This is the feedback loop that makes the AI improve over time.

Workflow:
  load_outcomes → compute_adherence → calculate_cost_impact → adjust_risk_score → summarize
"""

from __future__ import annotations

import logging
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from src.backend.database.queries import (
    get_triage_history,
    get_member_claims,
    get_member,
    save_audit_log,
)
from src.backend.scoring.risk_calculator import calculate_risk

logger = logging.getLogger(__name__)

# Cost benchmarks for calculating actual vs. recommended
_SETTING_COSTS = {
    "emergency":   2800,
    "urgent_care":  180,
    "telehealth":    75,
    "pcp":          200,
    "specialist":   320,
    "self_care":     15,
}


class OutcomeState(TypedDict):
    member_id: str

    # Loaded data
    member: dict | None
    triage_outcomes: list[dict]
    recent_claims: list[dict]

    # Computed metrics
    adherence_rate: float
    adherent_episodes: int
    total_episodes: int
    cost_savings_realized: float
    cost_savings_missed: float

    # Risk adjustment
    current_risk: dict | None
    adjusted_risk_delta: float

    # Summary
    engagement_rate: float
    cost_impact: dict
    risk_adjustment: dict
    recommendations: list[str]
    error: str | None


def _load_outcomes_node(state: OutcomeState) -> OutcomeState:
    """Node 1: Load all triage outcomes and recent claims for the member."""
    member_id = state["member_id"]
    member = get_member(member_id) or {}
    triage_outcomes = get_triage_history(member_id, limit=50)
    recent_claims = get_member_claims(member_id, limit=30)

    return {
        **state,
        "member": member,
        "triage_outcomes": triage_outcomes,
        "recent_claims": recent_claims,
    }


def _compute_adherence_node(state: OutcomeState) -> OutcomeState:
    """
    Node 2: Compare recommended vs. actual care.
    'actual_care_used' field in triage_outcome is set by downstream systems
    when the member's claim comes in matching the recommendation.
    """
    outcomes = state.get("triage_outcomes", [])
    if not outcomes:
        return {**state, "adherence_rate": 0.0, "adherent_episodes": 0, "total_episodes": 0}

    # Only score outcomes where we have actual_care_used data
    scored = [o for o in outcomes if o.get("actual_care_used")]
    total = len(scored)
    adherent = sum(
        1 for o in scored
        if o.get("actual_care_used") == o.get("recommendation")
    )

    adherence_rate = adherent / total if total > 0 else 0.0

    return {
        **state,
        "adherence_rate": round(adherence_rate, 3),
        "adherent_episodes": adherent,
        "total_episodes": total,
    }


def _calculate_cost_impact_node(state: OutcomeState) -> OutcomeState:
    """
    Node 3: Calculate actual cost savings realized vs. potential savings missed.
    Savings = (ER cost) - (actual care cost) when member followed recommendation away from ER.
    Missed = same calculation when member went to ER despite lower-acuity recommendation.
    """
    outcomes = state.get("triage_outcomes", [])
    er_cost = _SETTING_COSTS["emergency"]

    savings_realized = 0.0
    savings_missed = 0.0

    for o in outcomes:
        rec = o.get("recommendation")
        actual = o.get("actual_care_used")
        if not rec or not actual:
            continue

        rec_cost = _SETTING_COSTS.get(rec, 200)
        actual_cost = _SETTING_COSTS.get(actual, 200)

        if rec != "emergency" and actual == rec:
            # Followed non-ER recommendation — saved vs. if they'd gone to ER
            savings_realized += er_cost - rec_cost
        elif rec != "emergency" and actual == "emergency":
            # Went to ER despite non-emergency recommendation
            savings_missed += er_cost - rec_cost

    cost_impact = {
        "savings_realized": round(savings_realized, 2),
        "savings_missed": round(savings_missed, 2),
        "net_savings": round(savings_realized - savings_missed, 2),
        "adherent_episodes": state.get("adherent_episodes", 0),
        "total_tracked_episodes": state.get("total_episodes", 0),
        "adherence_rate_pct": round(state.get("adherence_rate", 0) * 100, 1),
    }

    return {
        **state,
        "cost_savings_realized": savings_realized,
        "cost_savings_missed": savings_missed,
        "cost_impact": cost_impact,
    }


def _adjust_risk_score_node(state: OutcomeState) -> OutcomeState:
    """
    Node 4: Compute current risk score and derive adjustment delta
    based on adherence and engagement behavior.
    High adherence → risk improves (better managed). Low adherence → risk stays or worsens.
    """
    member = state.get("member") or {}
    member_id = state["member_id"]
    claims = state.get("recent_claims", [])

    current_risk = None
    if member:
        risk = calculate_risk(
            member_id=member_id,
            age=member.get("age", 45),
            conditions=member.get("conditions", []),
            medications=member.get("medications", []),
            claims=claims,
            social_risk_flags=member.get("social_risk_flags", []),
        )
        current_risk = {
            "overall_risk": risk.overall_risk,
            "tier": risk.tier,
            "predicted_annual_cost": risk.predicted_annual_cost,
        }

    adherence = state.get("adherence_rate", 0.0)
    # Risk delta: well-adhered members trend -5 pts; non-adhered trend +5 pts
    if adherence >= 0.80:
        delta = -5.0
    elif adherence >= 0.60:
        delta = -2.0
    elif adherence >= 0.40:
        delta = 0.0
    else:
        delta = +5.0

    risk_adjustment = {
        "current_risk_score": current_risk.get("overall_risk") if current_risk else None,
        "current_tier": current_risk.get("tier") if current_risk else None,
        "adherence_delta": delta,
        "adjusted_risk": round(
            max(0, min(100, (current_risk.get("overall_risk", 50) if current_risk else 50) + delta)), 1
        ),
        "reasoning": (
            f"Adherence rate {adherence:.0%} → risk delta {delta:+.1f} points"
        ),
    }

    return {**state, "current_risk": current_risk, "adjusted_risk_delta": delta, "risk_adjustment": risk_adjustment}


def _summarize_node(state: OutcomeState) -> OutcomeState:
    """Node 5: Build final summary and generate recommendations for care managers."""
    adherence = state.get("adherence_rate", 0.0)
    net_savings = state.get("cost_impact", {}).get("net_savings", 0)

    recommendations: list[str] = []

    if adherence < 0.5 and state.get("total_episodes", 0) >= 3:
        recommendations.append(
            "Low recommendation adherence detected. Consider outreach to identify barriers "
            "(transportation, cost, health literacy)."
        )

    if state.get("cost_savings_missed", 0) > 1000:
        recommendations.append(
            f"${state['cost_savings_missed']:,.0f} in avoidable ER costs. "
            "Enroll in care navigation or on-demand telehealth program."
        )

    if state.get("risk_adjustment", {}).get("adherence_delta", 0) > 0:
        recommendations.append(
            "Risk score trending upward. Prioritize case management outreach within 7 days."
        )

    if not recommendations:
        recommendations.append("Member engagement is on track. Continue current outreach cadence.")

    try:
        save_audit_log(
            action="outcome_tracking",
            user_id=state["member_id"],
            resource="outcome_tracker",
            details={
                "adherence_rate": adherence,
                "net_savings": net_savings,
                "episodes_tracked": state.get("total_episodes", 0),
            },
        )
    except Exception:
        pass

    return {
        **state,
        "recommendations": recommendations,
        "engagement_rate": adherence,
    }


def _build_outcome_graph() -> Any:
    graph = StateGraph(OutcomeState)

    graph.add_node("load_outcomes", _load_outcomes_node)
    graph.add_node("compute_adherence", _compute_adherence_node)
    graph.add_node("calculate_cost_impact", _calculate_cost_impact_node)
    graph.add_node("adjust_risk_score", _adjust_risk_score_node)
    graph.add_node("summarize", _summarize_node)

    graph.set_entry_point("load_outcomes")
    graph.add_edge("load_outcomes", "compute_adherence")
    graph.add_edge("compute_adherence", "calculate_cost_impact")
    graph.add_edge("calculate_cost_impact", "adjust_risk_score")
    graph.add_edge("adjust_risk_score", "summarize")
    graph.add_edge("summarize", END)

    return graph.compile()


outcome_graph = _build_outcome_graph()


def run_outcome_tracking(member_id: str) -> dict:
    """
    Entry point for outcome tracker.
    Returns dict with: engagement_rate, cost_impact, risk_adjustment, recommendations, error
    """
    initial_state: OutcomeState = {
        "member_id": member_id,
        "member": None,
        "triage_outcomes": [],
        "recent_claims": [],
        "adherence_rate": 0.0,
        "adherent_episodes": 0,
        "total_episodes": 0,
        "cost_savings_realized": 0.0,
        "cost_savings_missed": 0.0,
        "current_risk": None,
        "adjusted_risk_delta": 0.0,
        "engagement_rate": 0.0,
        "cost_impact": {},
        "risk_adjustment": {},
        "recommendations": [],
        "error": None,
    }

    final = outcome_graph.invoke(initial_state)

    if final.get("error"):
        return {"error": final["error"]}

    return {
        "engagement_rate": final["engagement_rate"],
        "cost_impact": final["cost_impact"],
        "risk_adjustment": final["risk_adjustment"],
        "recommendations": final["recommendations"],
        "error": None,
    }
