"""
LangGraph triage agent — multi-step clinical routing workflow.

Workflow:
  validate_input → enrich_with_history → call_claude_triage → calculate_cost_impact → format_output

Claude uses extended thinking for genuine clinical reasoning. Member context (conditions,
medications, prior triages, claims) is injected so routing is member-specific, not generic.
"""

from __future__ import annotations

import json
import logging
from typing import Any, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph

from src.backend.safety.input_validation import validate_symptoms
from src.backend.safety.output_filters import filter_output
from src.backend.scoring.risk_calculator import calculate_risk
from src.backend.database.queries import (
    get_member,
    get_member_claims,
    get_triage_history,
    save_triage_outcome,
    save_audit_log,
)
from src.backend.knowledge_base.kb_search import (
    search_kb,
    format_kb_rules_for_prompt,
)

logger = logging.getLogger(__name__)

# Care-setting cost benchmarks (national averages, 2024)
_COST_MAP = {
    "emergency":   {"typical_cost": 2800, "label": "Emergency Department"},
    "urgent_care": {"typical_cost": 180,  "label": "Urgent Care"},
    "telehealth":  {"typical_cost": 75,   "label": "Telehealth Visit"},
    "pcp":         {"typical_cost": 200,  "label": "Primary Care Provider"},
    "specialist":  {"typical_cost": 320,  "label": "Specialist Consultation"},
    "self_care":   {"typical_cost": 15,   "label": "Self-Care / OTC"},
}

TRIAGE_SYSTEM_PROMPT = """You are a clinical decision support system for a health insurance plan.
Your role is to recommend the most appropriate care setting for a member based on their symptoms
and their individual medical history. You do NOT diagnose — you route.

CARE SETTINGS (use exactly one):
- emergency: Life-threatening symptoms requiring immediate 911 / ER
- urgent_care: Acute non-life-threatening symptoms needing same-day care
- telehealth: Symptoms manageable via video visit
- pcp: Symptoms appropriate for a scheduled primary care appointment
- specialist: Symptoms requiring subspecialty evaluation
- self_care: Minor symptoms manageable at home with OTC remedies

RULES:
1. Always consider the member's active conditions — the same symptom means different risk for different patients.
2. For any red-flag symptoms (chest pain + diaphoresis, sudden severe headache, stroke signs, severe dyspnea),
   immediately recommend emergency regardless of history.
3. Return a JSON object with this exact structure:
   {
     "recommendation": "<one of the 6 settings>",
     "reasoning": "<clinical reasoning in 2-4 sentences>",
     "red_flags": ["<flag1>", "<flag2>"],
     "confidence": <float 0.0-1.0>,
     "thinking_summary": "<key considerations from your analysis>"
   }

NEVER diagnose. NEVER prescribe. NEVER tell the member they do not need a doctor for serious symptoms."""


class TriageState(TypedDict):
    # Input
    symptoms: str
    severity: str           # low | medium | high
    member_id: str

    # Enrichment
    member: dict | None
    claims: list[dict]
    triage_history: list[dict]
    risk_score: dict | None

    # KB match (populated before Claude call)
    matched_kb_rules: list[dict]
    kb_match: dict | None   # top matched rule surfaced in final response

    # Claude output
    raw_claude_output: str
    parsed_recommendation: dict

    # Final output
    recommendation: str
    reasoning: str
    red_flags: list[str]
    confidence: float
    cost_analysis: dict
    thinking: str
    error: str | None


def _validate_input_node(state: TriageState) -> TriageState:
    """Node 1: Validate and sanitize symptom input."""
    outcome = validate_symptoms(state["symptoms"])
    if not outcome.valid:
        # Self-harm and injection failures are surfaced immediately via error
        return {**state, "error": outcome.reason}

    # Use redacted input if PII was found
    clean_symptoms = outcome.redacted_input or state["symptoms"]
    return {**state, "symptoms": clean_symptoms, "error": None}


def _enrich_with_history_node(state: TriageState) -> TriageState:
    """Node 2: Fetch member record, claims, triage history from DB."""
    if state.get("error"):
        return state

    member_id = state["member_id"]
    member = get_member(member_id) or {}
    claims = get_member_claims(member_id, limit=50)
    triage_history = get_triage_history(member_id, limit=5)

    # Compute risk score for context injection
    risk = None
    if member:
        risk = calculate_risk(
            member_id=member_id,
            age=member.get("age", 40),
            conditions=member.get("conditions", []),
            medications=member.get("medications", []),
            claims=claims,
            social_risk_flags=member.get("social_risk_flags", []),
        )

    return {
        **state,
        "member": member,
        "claims": claims,
        "triage_history": triage_history,
        "risk_score": {
            "overall_risk": risk.overall_risk,
            "tier": risk.tier,
            "predicted_annual_cost": risk.predicted_annual_cost,
        } if risk else None,
    }


def _search_kb_node(state: TriageState) -> TriageState:
    """Node 3: Search KB for rules matching the symptom input."""
    if state.get("error"):
        return state

    symptoms = state["symptoms"]
    matched = search_kb(symptoms, top_k=3)

    # Pick the top match (highest score, already sorted) for the response payload
    top_match = None
    if matched:
        top = matched[0]
        top_match = {
            "entry_id": top["id"],
            "category": top["category"],
            "decision": top["decision"],
            "confidence": top["confidence"],
            "sources": top.get("sources", []),
        }
        logger.info(
            f"KB matched rule {top['id']} (category={top['category']}, "
            f"confidence={top['confidence']}) for symptoms: '{symptoms[:80]}'"
        )

    return {**state, "matched_kb_rules": matched, "kb_match": top_match}


def _call_claude_triage_node(state: TriageState) -> TriageState:
    """Node 4: Extended-thinking Claude call with full member context + KB rules."""
    if state.get("error"):
        return state

    from src.backend.config import settings

    member = state.get("member") or {}
    risk = state.get("risk_score") or {}

    # Build rich member context for the prompt
    history_summary = ""
    if state["triage_history"]:
        recent = state["triage_history"][:3]
        history_summary = "Recent triage history:\n" + "\n".join(
            f"- {t.get('created_at', 'unknown date')}: {t.get('symptoms', '')} → {t.get('recommendation', '')}"
            for t in recent
        )

    user_content = f"""Member Profile:
- Age: {member.get('age', 'unknown')}
- Active conditions: {', '.join(member.get('conditions', [])) or 'None documented'}
- Current medications: {', '.join(member.get('medications', [])) or 'None documented'}
- Risk tier: {risk.get('tier', 'unknown')} ({risk.get('overall_risk', 'N/A')}/100)
- Predicted annual cost: ${risk.get('predicted_annual_cost', 0):,.0f}

{history_summary}

Current Presentation:
Symptoms: {state['symptoms']}
Member-reported severity: {state['severity']}

Provide your routing recommendation as JSON per the system instructions."""

    try:
        llm = ChatAnthropic(
            model="claude-opus-4-7",
            api_key=settings.anthropic_api_key,
            thinking={"type": "enabled", "budget_tokens": settings.triage_thinking_budget},
            temperature=1,  # required when thinking is enabled
        )

        # Append KB rules to system prompt when available; always inject emergency rules
        matched_rules = state.get("matched_kb_rules") or []
        emergency_rules = [
            r for r in matched_rules
            if r.get("category") == "emergency" and float(r.get("confidence", 0)) > 0.95
        ]
        # Inject emergency rules first (highest priority), then remaining matched rules
        inject_rules = emergency_rules + [r for r in matched_rules if r not in emergency_rules]
        kb_block = format_kb_rules_for_prompt(inject_rules)

        system_content = TRIAGE_SYSTEM_PROMPT + kb_block

        messages = [
            SystemMessage(content=system_content),
            HumanMessage(content=user_content),
        ]

        response = llm.invoke(messages)
        raw_output = response.content

        # Extract thinking block if present
        thinking_text = ""
        json_text = ""
        if isinstance(raw_output, list):
            for block in raw_output:
                if hasattr(block, "type"):
                    if block.type == "thinking":
                        thinking_text = block.thinking
                    elif block.type == "text":
                        json_text = block.text
        else:
            json_text = str(raw_output)

        return {**state, "raw_claude_output": json_text, "thinking": thinking_text}

    except Exception as exc:
        logger.error(f"Claude triage call failed: {exc}")
        return {**state, "error": f"AI service error: {str(exc)[:100]}"}


def _parse_and_route_node(state: TriageState) -> TriageState:
    """Node 4: Parse Claude's JSON output and validate recommendation."""
    if state.get("error"):
        return state

    raw = state.get("raw_claude_output", "")
    parsed: dict = {}

    # Extract JSON from response (Claude sometimes wraps in markdown code blocks)
    try:
        import re
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            parsed = json.loads(match.group())
    except (json.JSONDecodeError, AttributeError):
        logger.warning(f"Failed to parse Claude JSON: {raw[:200]}")
        parsed = {}

    valid_recommendations = {"emergency", "urgent_care", "telehealth", "pcp", "specialist", "self_care"}
    recommendation = parsed.get("recommendation", "pcp")
    if recommendation not in valid_recommendations:
        recommendation = "pcp"

    # Severity override: if member says 'high' and Claude says self_care, bump to urgent_care
    if state["severity"] == "high" and recommendation == "self_care":
        recommendation = "urgent_care"

    confidence = float(parsed.get("confidence", 0.75))
    reasoning = parsed.get("reasoning", "Based on symptom pattern and member history.")
    red_flags = parsed.get("red_flags", [])

    return {
        **state,
        "recommendation": recommendation,
        "reasoning": reasoning,
        "red_flags": red_flags,
        "confidence": confidence,
        "parsed_recommendation": parsed,
    }


def _calculate_cost_impact_node(state: TriageState) -> TriageState:
    """Node 5: Calculate cost comparison between recommended vs ER visit."""
    if state.get("error"):
        return state

    rec = state.get("recommendation", "pcp")
    rec_info = _COST_MAP.get(rec, {"typical_cost": 200, "label": rec})
    er_info = _COST_MAP["emergency"]

    cost_analysis = {
        "recommended_setting": rec_info["label"],
        "recommended_cost": rec_info["typical_cost"],
        "er_alternative_cost": er_info["typical_cost"],
        "estimated_savings": max(0, er_info["typical_cost"] - rec_info["typical_cost"]),
        "cost_note": (
            f"Routing to {rec_info['label']} instead of the ER saves an estimated "
            f"${max(0, er_info['typical_cost'] - rec_info['typical_cost']):,}."
        ) if rec != "emergency" else "Emergency care is medically necessary.",
    }

    # Persist outcome asynchronously (best-effort)
    try:
        save_triage_outcome(state["member_id"], {
            "recommendation": rec,
            "reasoning": state.get("reasoning", ""),
            "confidence": state.get("confidence", 0.75),
            "symptoms": state["symptoms"],
            "cost_analysis": cost_analysis,
        })
        save_audit_log(
            action="triage",
            user_id=state["member_id"],
            resource="triage_agent",
            details={"recommendation": rec, "confidence": state.get("confidence")},
        )
    except Exception as exc:
        logger.warning(f"Failed to persist triage outcome: {exc}")

    # Apply output filter before returning
    filtered = filter_output(state.get("reasoning", ""), confidence=state.get("confidence", 0.75))
    final_reasoning = filtered.output if filtered.allowed else filtered.output

    return {**state, "cost_analysis": cost_analysis, "reasoning": final_reasoning}


def _build_triage_graph() -> Any:
    graph = StateGraph(TriageState)

    graph.add_node("validate_input", _validate_input_node)
    graph.add_node("enrich_with_history", _enrich_with_history_node)
    graph.add_node("search_kb", _search_kb_node)
    graph.add_node("call_claude_triage", _call_claude_triage_node)
    graph.add_node("parse_and_route", _parse_and_route_node)
    graph.add_node("calculate_cost_impact", _calculate_cost_impact_node)

    graph.set_entry_point("validate_input")
    graph.add_edge("validate_input", "enrich_with_history")
    graph.add_edge("enrich_with_history", "search_kb")
    graph.add_edge("search_kb", "call_claude_triage")
    graph.add_edge("call_claude_triage", "parse_and_route")
    graph.add_edge("parse_and_route", "calculate_cost_impact")
    graph.add_edge("calculate_cost_impact", END)

    return graph.compile()


# Compiled graph — import and call .invoke()
triage_graph = _build_triage_graph()


def run_triage(symptoms: str, severity: str, member_id: str) -> dict:
    """
    Main entry point for triage agent.

    Returns dict with: recommendation, reasoning, confidence, cost_analysis,
    red_flags, thinking, risk_score, error
    """
    initial_state: TriageState = {
        "symptoms": symptoms,
        "severity": severity,
        "member_id": member_id,
        "member": None,
        "claims": [],
        "triage_history": [],
        "risk_score": None,
        "matched_kb_rules": [],
        "kb_match": None,
        "raw_claude_output": "",
        "parsed_recommendation": {},
        "recommendation": "pcp",
        "reasoning": "",
        "red_flags": [],
        "confidence": 0.0,
        "cost_analysis": {},
        "thinking": "",
        "error": None,
    }

    final_state = triage_graph.invoke(initial_state)

    if final_state.get("error"):
        return {
            "error": final_state["error"],
            "recommendation": None,
            "reasoning": None,
            "confidence": 0.0,
            "cost_analysis": {},
            "red_flags": [],
        }

    return {
        "recommendation": final_state["recommendation"],
        "reasoning": final_state["reasoning"],
        "confidence": final_state["confidence"],
        "red_flags": final_state["red_flags"],
        "cost_analysis": final_state["cost_analysis"],
        "thinking": final_state["thinking"],
        "risk_score": final_state["risk_score"],
        "triage_history": final_state["triage_history"][:3],
        "kb_match": final_state.get("kb_match"),
        "error": None,
    }
