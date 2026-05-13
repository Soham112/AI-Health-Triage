"""
Claims Campaign Agent — Skeleton

Generates personalized outreach campaigns for a member based on their
claims history, risk score, and identified prevention gaps.

Full implementation is a 3-day project (see CLAUDE.md for the plan).
This skeleton wires the LangGraph graph, defines state shape, and stubs
each node so the workflow compiles and can be called end-to-end.

FastAPI endpoint (add to server.py):
    POST /api/backend/campaigns/{member_id}
    Response: ClaimsCampaignState with campaigns, predicted_roi, etc.
"""

from __future__ import annotations

from typing import TypedDict

from langgraph.graph import END, StateGraph


# ─── State ────────────────────────────────────────────────────────────────────

class ClaimsCampaignState(TypedDict):
    member_id: str
    claims_data: list[dict]       # Recent claims (CPT + ICD-10 + cost)
    member: dict                  # Demographics, conditions, medications
    risk_score: float             # 0-100 overall risk
    risk_tier: str                # low | moderate | high | critical
    identified_gaps: list[dict]   # Missing screenings / care gaps
    campaigns: list[dict]         # Generated outreach messages
    predicted_roi: float          # Estimated $ saved if member acts
    error: str | None


# ─── Nodes ────────────────────────────────────────────────────────────────────

def fetch_member_claims(state: ClaimsCampaignState) -> ClaimsCampaignState:
    """Load recent claims + member record from DB or mock data."""
    # TODO: Query Supabase claims table
    #   claims = supabase.table("claims")
    #       .select("*").eq("member_id", member_id)
    #       .order("claim_date", desc=True).limit(100).execute()
    #
    # TODO: Use mock data as fallback (src/backend/database/queries.py)
    #   from src.backend.database.queries import get_member, get_member_claims
    #   member = get_member(state["member_id"])
    #   claims = get_member_claims(state["member_id"], limit=100)
    return {
        **state,
        "claims_data": [],  # TODO: replace with actual claims
        "member": {},       # TODO: replace with actual member record
    }


def identify_prevention_gaps(state: ClaimsCampaignState) -> ClaimsCampaignState:
    """Find missing age-appropriate screenings based on conditions and claims history.

    Gap logic examples:
    - Age >= 45 and no colonoscopy CPT (45378/45380/45385) in last 10 years → CRC gap
    - Age 40-74 female and no mammogram CPT (77067) in last 2 years → breast cancer gap
    - Diabetes (ICD-10 E11.x) and no eye exam CPT (92014) in last year → retinopathy gap
    - Age >= 65 and no pneumococcal vaccine → pneumonia gap
    """
    # TODO: Implement ICD-10 prefix matching + CPT code screening logic
    #   from src.backend.scoring.claims_analyzer import analyze_claims
    #   analysis = analyze_claims(state["claims_data"], state["member"])
    #   gaps = analysis.prevention_gaps

    # TODO: Cross-reference with USPSTF recommendations by age/sex/conditions

    gaps: list[dict] = []  # TODO: replace with actual gap detection

    # TODO: Also run risk scoring engine
    #   from src.backend.scoring.risk_calculator import calculate_risk
    #   risk = calculate_risk(member_id, ...)

    return {
        **state,
        "identified_gaps": gaps,
        "risk_score": 0.0,   # TODO: actual score
        "risk_tier": "low",  # TODO: actual tier
    }


def calculate_roi(state: ClaimsCampaignState) -> ClaimsCampaignState:
    """Estimate $ saved per gap if the member completes the recommended screening.

    ROI benchmarks (national averages):
    - Colonoscopy ($1,200) prevents late-stage colon cancer treatment (~$120,000) → ROI $118,800
    - Mammogram ($250) prevents late-stage breast cancer treatment (~$150,000) → ROI $149,750
    - Diabetic eye exam ($200) prevents advanced retinopathy/blindness (~$25,000) → ROI $24,800
    - A1C monitoring ($50) prevents DKA hospitalization (~$20,000) → ROI $19,950
    """
    # TODO: Load SCREENING_COST and AVOIDED_TREATMENT_COST lookup tables
    # TODO: Apply member risk multiplier (high-risk member → higher expected ROI)
    #   if risk_tier == "high": roi *= 1.5  # higher likelihood of benefit

    total_roi = 0.0  # TODO: sum across all identified gaps

    return {**state, "predicted_roi": total_roi}


def generate_campaigns(state: ClaimsCampaignState) -> ClaimsCampaignState:
    """Call Claude to write personalized outreach messages for each gap.

    Claude receives:
    - Member demographics + conditions
    - Identified gap with clinical context
    - Predicted ROI

    Claude returns JSON list:
    [
        {
            "campaign_type": "SCREENING",
            "screening": "Colonoscopy",
            "urgency": "high",
            "reason": "Age 52, no colonoscopy in 10 years",
            "predicted_roi": 8500,
            "message": "Your colonoscopy screening is overdue..."
        }
    ]
    """
    # TODO: Build prompt from state["identified_gaps"] + state["member"]
    # TODO: Call Claude (claude-opus-4-7, temp=0.3)
    #   from langchain_anthropic import ChatAnthropic
    #   llm = ChatAnthropic(model="claude-opus-4-7", temperature=0.3)
    #   response = llm.invoke([SystemMessage(...), HumanMessage(...)])

    # TODO: Parse JSON from response, sort by predicted_roi DESC
    # TODO: Apply output guardrails (no diagnosis, no prescription)

    campaigns: list[dict] = []  # TODO: replace with actual campaigns

    return {**state, "campaigns": campaigns}


# ─── Graph ────────────────────────────────────────────────────────────────────

def _build_campaign_graph() -> object:
    graph: StateGraph = StateGraph(ClaimsCampaignState)

    graph.add_node("fetch_claims", fetch_member_claims)
    graph.add_node("identify_gaps", identify_prevention_gaps)
    graph.add_node("calculate_roi", calculate_roi)
    graph.add_node("generate_campaign", generate_campaigns)

    graph.set_entry_point("fetch_claims")
    graph.add_edge("fetch_claims", "identify_gaps")
    graph.add_edge("identify_gaps", "calculate_roi")
    graph.add_edge("calculate_roi", "generate_campaign")
    graph.add_edge("generate_campaign", END)

    return graph.compile()


campaign_graph = _build_campaign_graph()


# ─── Entry point ──────────────────────────────────────────────────────────────

def run_campaigns(member_id: str) -> dict:
    """
    Main entry point for the claims campaign agent.

    Returns:
        {
            "member_id": str,
            "campaigns": list[dict],
            "predicted_roi": float,
            "risk_score": float,
            "risk_tier": str,
            "identified_gaps": list[dict],
            "error": str | None
        }
    """
    initial: ClaimsCampaignState = {
        "member_id": member_id,
        "claims_data": [],
        "member": {},
        "risk_score": 0.0,
        "risk_tier": "low",
        "identified_gaps": [],
        "campaigns": [],
        "predicted_roi": 0.0,
        "error": None,
    }

    final = campaign_graph.invoke(initial)

    return {
        "member_id": member_id,
        "campaigns": final["campaigns"],
        "predicted_roi": final["predicted_roi"],
        "risk_score": final["risk_score"],
        "risk_tier": final["risk_tier"],
        "identified_gaps": final["identified_gaps"],
        "error": final.get("error"),
    }


# ─── FastAPI endpoint (add to server.py) ──────────────────────────────────────
#
# from src.backend.agents.claims_campaign_agent import run_campaigns
#
# @app.post("/api/backend/campaigns/{member_id}")
# async def get_campaigns(member_id: str):
#     result = run_campaigns(member_id)
#     if result.get("error"):
#         raise HTTPException(status_code=500, detail=result["error"])
#     return result
