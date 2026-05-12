<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# LangGraph Agents — Arlo Health AI Backend

## Agent 1: Triage Agent (`src/backend/agents/triage_agent.py`)

**Purpose**: Routes member symptoms to the correct care setting using extended thinking + full member context.

**Workflow (5 nodes)**:
```
validate_input → enrich_with_history → call_claude_triage → parse_and_route → calculate_cost_impact
```

| Node | What it does |
|------|-------------|
| `validate_input` | Safety checks: self-harm detection (returns 988), injection detection, PII redaction, length limits |
| `enrich_with_history` | Fetches member record, 50 claims, 5 prior triages from DB; computes current risk score |
| `call_claude_triage` | `claude-opus-4-7` with `thinking: {budget_tokens: 800}`. System prompt injects member age, conditions, medications, risk tier, and prior triage history. Forces JSON output. |
| `parse_and_route` | Parses JSON, validates recommendation against enum, applies severity override (user says 'high' + Claude says 'self_care' → bumps to urgent_care) |
| `calculate_cost_impact` | Compares recommended setting cost vs. ER; persists outcome to DB; runs output guardrail filter |

**Key design**: Self-harm triggers immediate 988 return regardless of downstream state. Extended thinking enabled — thinking text returned to frontend for transparency.

---

## Agent 2: Claims Analysis Agent (`src/backend/agents/claims_agent.py`)

**Purpose**: Generates ROI-ranked preventive campaigns from claims history using scoring engine + Claude narrative.

**Workflow (4 nodes)**:
```
fetch_claims → parse_and_score → call_claude_insights → rank_campaigns
```

| Node | What it does |
|------|-------------|
| `fetch_claims` | Loads full claims history (up to 100 records) and member record |
| `parse_and_score` | Runs `claims_analyzer` (ICD-10 pattern detection, cost driver bucketing) and `risk_calculator` (0-100 score with breakdown) |
| `call_claude_insights` | `claude-opus-4-7` at temp=0.3. Receives pre-analyzed structured summary — cost drivers, patterns, gaps — NOT raw CPT codes. Returns 3-5 campaigns as JSON. |
| `rank_campaigns` | Sorts by ROI multiple; falls back to scoring engine gap data if Claude JSON fails; computes portfolio ROI summary |

**Key design**: Claude sees structured analysis output, not raw data. The scoring engine does the heavy lifting; Claude adds narrative justification and economic reasoning that requires language understanding.

---

## Agent 3: Outcome Tracker (`src/backend/agents/outcome_tracker.py`)

**Purpose**: Measures whether recommendations were followed, tracks real cost savings, adjusts risk scores.

**Workflow (5 nodes)**:
```
load_outcomes → compute_adherence → calculate_cost_impact → adjust_risk_score → summarize
```

| Node | What it does |
|------|-------------|
| `load_outcomes` | Loads triage history + recent claims |
| `compute_adherence` | Compares `recommendation` vs `actual_care_used` across all tracked episodes |
| `calculate_cost_impact` | Savings realized (followed non-ER rec) vs. savings missed (went to ER despite lower rec) |
| `adjust_risk_score` | Adherence ≥80% → -5 risk pts; <40% → +5 risk pts. Recomputes current score. |
| `summarize` | Generates care manager recommendations (outreach triggers, escalation signals) |

**Key design**: This is the feedback loop. As members engage (or don't), risk scores update and outreach recommendations evolve. No Claude call — this is pure actuarial logic.

---

## Example Inputs / Outputs

### Triage Agent

**Input**:
```python
run_triage(
  symptoms="chest tightness radiating to left arm, diaphoresis",
  severity="high",
  member_id="MBR0042"  # 65yo with ischemic heart disease, prior hospitalization
)
```

**Output**:
```python
{
  "recommendation": "emergency",
  "reasoning": "Classic ACS presentation in a high-risk cardiac patient...\n\n---\n*Informational only...*",
  "confidence": 0.96,
  "red_flags": ["cardiac_symptom_pattern", "high_risk_patient"],
  "cost_analysis": {"recommended_cost": 2800, "estimated_savings": 0},
  "thinking": "Member has I25.10 (ischemic heart disease) and prior hospitalization...",
  "risk_score": {"overall_risk": 74.9, "tier": "high"}
}
```

### Claims Agent

**Input**:
```python
run_claims_analysis(member_id="MBR0042")
```

**Output**:
```python
{
  "campaigns": [
    {"title": "Diabetic Retinopathy Screening", "roi_multiple": 23.3, "urgency": "high", ...},
    {"title": "Care Management Enrollment", "roi_multiple": 32.0, "urgency": "high", ...},
  ],
  "projected_savings": 14200,
  "roi_analysis": {"portfolio_roi_multiple": 23.7},
  "patterns_found": ["3 ER visits — unmanaged chronic conditions", "No preventive visits"]
}
```
