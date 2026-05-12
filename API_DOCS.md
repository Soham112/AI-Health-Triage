# API Documentation

## Architecture

```
Browser / Frontend
      │
      ▼
Next.js (port 3000)
  ├── /api/triage          → tries Python backend, falls back to direct Claude call
  ├── /api/chat            → direct Claude call with session memory
  ├── /api/preventive      → rules engine + Claude narrative
  └── /api/members         → member lookup (mock data / Supabase)
      │
      │ PYTHON_BACKEND_URL
      ▼
FastAPI Backend (port 8000)
  ├── POST /api/backend/triage
  ├── POST /api/backend/claims
  ├── GET  /api/backend/health/{member_id}
  └── POST /api/backend/outcomes/{member_id}
```

---

## Next.js API Routes

### POST /api/triage

Routes symptoms to the appropriate care setting.

**Request**
```json
{
  "memberId": "MBR0042",
  "symptoms": "chest tightness and shortness of breath",
  "severity": "high"
}
```

**Response**
```json
{
  "success": true,
  "correlationId": "abc123",
  "source": "python_backend",
  "recommendation": {
    "careLevel": "emergency",
    "label": "Emergency Room",
    "confidence": 92,
    "timeToSee": "Immediately",
    "estimatedCost": 2800
  },
  "clinicalReasoning": "Chest tightness + SOB in a 65yo with ischemic heart disease warrants immediate ED evaluation...",
  "reasoning": {
    "thinkingProcess": "...",
    "redFlags": ["cardiac_symptom_pattern"],
    "memberContextUsed": "...",
    "immediateActions": ["Call 911", "Chew aspirin if not contraindicated"]
  },
  "costComparison": {
    "recommended_setting": "Emergency Department",
    "recommended_cost": 2800,
    "er_alternative_cost": 2800,
    "estimated_savings": 0
  },
  "riskScore": {
    "overall_risk": 74.9,
    "tier": "high",
    "predicted_annual_cost": 23500
  }
}
```

**Error Codes**
| Status | Meaning |
|--------|---------|
| 400 | Invalid input / injection detected |
| 404 | Member not found |
| 422 | Schema validation failure |
| 429 | Rate limit exceeded |
| 500 | Internal error |
| 503 | AI service not configured |

---

### POST /api/chat

Contextual health guidance chat.

**Request**
```json
{
  "memberId": "MBR0042",
  "message": "Should I take my blood pressure medication on an empty stomach?",
  "sessionId": "session_abc"
}
```

**Response**
```json
{
  "response": "For most ACE inhibitors and ARBs...",
  "sessionId": "session_abc",
  "confidence": 0.89,
  "disclaimer": "..."
}
```

---

### POST /api/preventive

Generate preventive care campaigns for a member.

**Request**
```json
{ "memberId": "MBR0042" }
```

**Response**
```json
{
  "campaigns": [...],
  "riskScore": 74,
  "totalProjectedSavings": 18400
}
```

---

## Python Backend Routes

Start server: `uvicorn src.backend.api.server:app --port 8000 --reload`

---

### POST /api/backend/triage

Runs the full LangGraph triage agent (5 nodes, extended thinking).

**Request**
```json
{
  "symptoms": "fever 102F and productive cough",
  "severity": "medium",
  "member_id": "MBR0042"
}
```

**Response**
```json
{
  "recommendation": "urgent_care",
  "reasoning": "Fever with productive cough in a diabetic warrants same-day evaluation...\n\n---\n*This guidance is for informational purposes only...*",
  "confidence": 0.87,
  "red_flags": [],
  "cost_analysis": {
    "recommended_setting": "Urgent Care Center",
    "recommended_cost": 180,
    "er_alternative_cost": 2800,
    "estimated_savings": 2620,
    "cost_note": "Routing to Urgent Care instead of the ER saves an estimated $2,620."
  },
  "thinking": "The member has T2DM which increases infection risk...",
  "risk_score": {
    "overall_risk": 61.2,
    "tier": "high",
    "predicted_annual_cost": 18000
  },
  "triage_history": [...],
  "error": null
}
```

---

### POST /api/backend/claims

Runs the LangGraph claims analysis agent (4 nodes + Claude campaign generation).

**Request**
```json
{ "member_id": "MBR0042" }
```

**Response**
```json
{
  "campaigns": [
    {
      "campaign_id": "C001",
      "title": "Diabetic Eye Exam Outreach",
      "target_gap": "Diabetic Retinopathy Screening",
      "intervention": "Schedule annual dilated eye exam",
      "outreach_channel": "sms",
      "timing": "Within 30 days",
      "clinical_rationale": "No retinopathy screening in 2 years. ICD-10: E11.311. Annual screening prevents $3,500 in average treatment costs.",
      "projected_annual_savings": 3500,
      "intervention_cost": 150,
      "roi_multiple": 23.3,
      "urgency": "high",
      "icd10_codes": ["E11.311"]
    }
  ],
  "patterns_found": [
    "3 ER visits detected. High utilization may indicate unmanaged chronic conditions.",
    "No annual preventive visit found."
  ],
  "projected_savings": 14200,
  "roi_analysis": {
    "campaign_count": 4,
    "total_projected_savings": 14200,
    "total_intervention_cost": 600,
    "portfolio_roi_multiple": 23.7,
    "top_opportunity": "Diabetic Eye Exam Outreach"
  },
  "risk_score": { "overall_risk": 61.2, "tier": "high" },
  "error": null
}
```

---

### GET /api/backend/health/{member_id}

Full health intelligence profile — no Claude call, pure scoring engine.

**Response**
```json
{
  "member_id": "MBR0042",
  "member": { "name": "...", "age": 65, "conditions": ["E11.9", "I10"], ... },
  "risk_score": {
    "overall_risk": 61.2,
    "tier": "high",
    "predicted_annual_cost": 18000,
    "confidence": 0.80,
    "breakdown": {
      "condition_burden": 27.5,
      "utilization": 19.2,
      "medication_complexity": 8.0,
      "age": 4.8,
      "social_determinants": 0.0
    },
    "risk_factors": [...]
  },
  "claims_summary": { "total_cost": 12400, "er_visit_count": 3, ... },
  "preventive_opportunities": [...],
  "care_patterns": [...]
}
```

---

### POST /api/backend/outcomes/{member_id}

Outcome tracking — adherence rate, cost savings realized, risk delta.

**Response**
```json
{
  "engagement_rate": 0.71,
  "cost_impact": {
    "savings_realized": 5240,
    "savings_missed": 1400,
    "net_savings": 3840,
    "adherence_rate_pct": 71.4
  },
  "risk_adjustment": {
    "current_risk_score": 61.2,
    "adherence_delta": -2.0,
    "adjusted_risk": 59.2,
    "reasoning": "Adherence rate 71% → risk delta -2.0 points"
  },
  "recommendations": [
    "Member engagement is on track. Continue current outreach cadence."
  ],
  "error": null
}
```

---

## Running Locally (Both Servers)

```bash
# Terminal 1 — Next.js frontend
npm run dev

# Terminal 2 — Python backend
source venv/bin/activate
uvicorn src.backend.api.server:app --host 0.0.0.0 --port 8000 --reload

# Seed mock data into Supabase (once)
PYTHONPATH=. python -m src.backend.database.seeder

# Run backend tests
PYTHONPATH=. python src/backend/test_agents.py --quick
```
