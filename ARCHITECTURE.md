# Arlo Health — System Architecture

## Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                         │
│   Triage Tab │ Chat Tab │ Preventive Tab │ Dashboard Tab         │
│   src/app/page.tsx                                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────────────────┐
│                  Next.js App Router (Vercel)                      │
│                                                                  │
│  /api/triage      →  rate limit → validate → proxy or fallback  │
│  /api/chat        →  rate limit → validate → Claude Haiku        │
│  /api/preventive  →  rate limit → validate → claims analysis     │
│  /api/members     →  member list (mock or Supabase)              │
│  /api/dashboard   →  population analytics aggregate              │
│                                                                  │
│  src/lib/rateLimiter.ts   — in-memory (swap: Upstash Redis)     │
│  src/lib/validators.ts    — input safety (injection, PII, Rx)   │
│  src/lib/guardrails.ts    — output safety (diagnosis block)      │
│  src/lib/auditLog.ts      — immutable audit trail                │
│  src/lib/encryption.ts    — AES-256-GCM field-level PHI         │
└───────┬──────────────────────────────────────────────────────────┘
        │ PYTHON_BACKEND_URL (if set)         │ fallback: direct Claude
        │                                     │
┌───────▼──────────────────────┐   ┌──────────▼──────────────────┐
│  FastAPI Backend (Railway)    │   │  Claude API (Anthropic)      │
│  src/backend/api/server.py    │   │  Opus 4 (extended thinking)  │
│                               │   │  Haiku 4.5 (chat)           │
│  POST /api/backend/triage     │   └─────────────────────────────┘
│  POST /api/backend/claims     │
│  GET  /api/backend/health/:id │
│                               │
│  ┌────────────────────────┐   │
│  │  LangGraph Agents       │   │
│  │                         │   │
│  │  triage_agent.py        │   │
│  │  6 nodes:               │   │
│  │  validate_input         │   │
│  │  enrich_with_history    │   │
│  │  search_kb              │   │
│  │  call_claude_triage ────┼───┼──→ Claude Opus (extended think)
│  │  parse_and_route        │   │
│  │  calculate_cost_impact  │   │
│  │                         │   │
│  │  claims_agent.py        │   │
│  │  4 nodes:               │   │
│  │  fetch_claims           │   │
│  │  parse_and_score        │   │
│  │  call_claude_insights ──┼───┼──→ Claude Opus (temp=0.3)
│  │  rank_campaigns         │   │
│  │                         │   │
│  │  outcome_tracker.py     │   │
│  │  5 nodes (no Claude)    │   │
│  └────────────────────────┘   │
│                               │
│  ┌────────────────────────┐   │
│  │  Scoring Engine         │   │
│  │  risk_calculator.py     │   │
│  │  claims_analyzer.py     │   │
│  └────────────────────────┘   │
│                               │
│  ┌────────────────────────┐   │
│  │  Knowledge Base         │   │
│  │  healthcare_kb_         │   │
│  │  decision_rules.json    │   │
│  │  (50 rules, cached)     │   │
│  │  kb_search.py           │   │
│  └────────────────────────┘   │
│                               │
│  ┌────────────────────────┐   │
│  │  Python Safety Layer    │   │
│  │  input_validation.py    │   │
│  │  output_filters.py      │   │
│  └────────────────────────┘   │
└───────────────┬───────────────┘
                │
┌───────────────▼───────────────────────────────────────────────┐
│                     Data Layer (Supabase)                       │
│                                                                │
│  members table   — profile, conditions, medications, risk tier │
│  claims table    — CPT/ICD-10 codes, dates, costs, providers  │
│  triage_log      — outcomes, reasoning, kb_match, confidence  │
│  audit_log       — HIPAA-grade immutable event stream          │
│                                                                │
│  Fallback: in-memory mock (src/lib/mockData.ts + seeder.py)   │
│            runs without any env vars — full demo capability    │
└───────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Triage Request

```
1. User submits symptoms + member_id (browser)
2. /api/triage validates input (injection, PII, length)
3. Rate limiter checks IP + member windows
4. If PYTHON_BACKEND_URL set → proxy to FastAPI
   Else → direct Claude call with member context from mockData
5. Python path:
   a. validate_input (self-harm → 988 immediate return)
   b. enrich_with_history (DB: member record, 50 claims, 5 prior triages)
   c. search_kb (keyword search 50 rules → top 3 matches, store kb_match)
   d. call_claude_triage (Opus, extended thinking, member context + KB rules)
   e. parse_and_route (validate enum, apply severity override)
   f. calculate_cost_impact (compare settings, persist to DB, apply guardrails)
6. Response: recommendation, reasoning, confidence, red_flags,
             cost_analysis, thinking, risk_score, kb_match
7. TS layer: redact PII, write audit log, return to browser
```

---

## Data Flow: Claims Analysis

```
1. /api/preventive called with member_id
2. Python path:
   a. fetch_claims (up to 100 records from DB or mock)
   b. parse_and_score:
      - claims_analyzer: ICD-10 pattern detection, ER overutilization,
        30-day readmission, prevention gap identification
      - risk_calculator: 5-dimension actuarial score (0-100)
   c. call_claude_insights (receives structured summary, NOT raw CPT codes)
   d. rank_campaigns (sort by ROI multiple, fallback to scoring engine gaps)
3. Response: campaigns[], projected_savings, roi_analysis, patterns_found
```

---

## Risk Scoring Model

5 weighted dimensions → 0-100 score with comorbidity multiplier:

| Dimension | Weight | Key Signals |
|-----------|--------|-------------|
| Condition burden | 30% | CHF=25, CKD4=28, DM2=20, per-condition weights |
| Utilization | 30% | ED visits (7/14/20 pts), hospitalizations (15/25 pts) |
| Medication complexity | 20% | Anticoagulants, biologics, insulins |
| Age | 10% | Graduated by decade from 60+ |
| SDOH | 10% | Social determinants of health factors |

Comorbidity multiplier: 1.0 (1 condition) → 1.4 (4+ conditions)

Risk tiers: critical ≥85 · high ≥65 · moderate ≥35 · low <35

See [SCORING.md](SCORING.md) for full methodology.

---

## Key Design Decisions

**No diagnosis, ever** — The system routes to care settings, not disease labels. All guardrail patterns in both TS and Python layers enforce this. Claude system prompts explicitly prohibit diagnostic language.

**Python as intelligence layer** — LangGraph multi-step workflows, comorbidity-aware scoring, and ICD-10 detection live in Python. TypeScript handles auth, rate limiting, UI concerns. The triage route proxies to Python when available and falls back to direct Claude otherwise.

**Mock-first data** — `src/lib/mockData.ts` (50 members) and `seeder.py` (100 members + 500 claims) both use real CPT/ICD-10 structures. The full platform runs without any env vars.

**KB injected into Claude prompt** — `healthcare_kb_decision_rules.json` rules are loaded once at server startup and injected into Claude's system prompt. Emergency rules (confidence >0.95) are injected first. This grounds Claude's reasoning in verified clinical guidelines.
