# Arlo Health — AI Healthcare Platform

A production-grade healthcare AI platform demonstrating full-stack ownership: intelligent triage with Claude extended thinking, context-aware health chat, claims-driven preventive care, and a population analytics dashboard — all built with safety-first, HIPAA-ready architecture.

## What This Proves

- **End-to-end ownership** — data modeling, actuarial risk scoring, LangGraph agents, AI integration, safety layer, API design, frontend, and deployment
- **Healthcare domain knowledge** — real CPT/ICD-10 codes, clinical triage logic, evidence-based preventive care guidelines, comorbidity-aware risk modeling
- **Production-grade thinking** — LangGraph multi-step workflows, rate limiting, audit logging, prompt injection prevention, PII detection, output guardrails, field-level encryption
- **Claude mastery** — extended thinking for clinical reasoning, context injection with member history, self-evaluating confidence scoring, output guardrails
- **Backend intelligence** — LangGraph agents, actuarial risk scoring with SDOH, ICD-10 pattern detection, ROI-ranked campaign generation, outcome tracking feedback loop

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                   │
│  Triage Tab │ Chat Tab │ Preventive Tab │ Dashboard Tab  │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│               API Layer (Next.js App Router)              │
│  /api/triage  /api/chat  /api/preventive  /api/dashboard │
│                                                          │
│  Rate Limiting │ Input Validation │ Audit Logging        │
└──────────┬────────────────────────────┬─────────────────┘
           │                            │  PYTHON_BACKEND_URL
           │                 ┌──────────▼─────────────────┐
           │                 │  FastAPI Backend (port 8000) │
           │                 │  LangGraph Agents:           │
           │                 │  - triage_agent (5 nodes)    │
           │                 │  - claims_agent (4 nodes)    │
           │                 │  - outcome_tracker (5 nodes) │
           │                 │  Scoring Engine:             │
           │                 │  - risk_calculator.py        │
           │                 │  - claims_analyzer.py        │
           │                 └────────────┬────────────────┘
           │                              │
┌──────────▼──────────┐    ┌─────────────▼────────────────┐
│  TS Safety Layer     │    │  Python Safety Layer          │
│  - validators.ts     │    │  - input_validation.py        │
│  - guardrails.ts     │    │  - output_filters.py          │
│  - encryption.ts     │    │                              │
│  - auditLog.ts       │    │  Claude API (extended        │
└──────────┬──────────┘    │  thinking, claude-opus-4-7)  │
           │               └─────────────┬────────────────┘
           │                             │
┌──────────▼─────────────────────────────▼────────────────┐
│               Data Layer                                  │
│  Mock Data (100 members, 500+ claims — seeder.py)        │
│  Supabase (when configured): PostgreSQL + pgvector       │
└─────────────────────────────────────────────────────────┘
```

## Key Features

### Triage Engine
- **Extended thinking** — Claude reasons through symptoms before routing
- **Member context injection** — uses actual conditions, medications, claims history
- **Red flag detection** — identifies emergency signals based on member-specific risk
- **Cost comparison** — shows ER ($2,800) vs urgent care ($280) vs telehealth ($75)
- **Clinical reasoning** — explains WHY this care level, not just a label

### Health Chat
Real-time health guidance powered by Claude Haiku (`claude-haiku-4-5-20251001`)

- **Context-aware** — system prompt includes member's actual conditions, medications, and risk tier
- **Confidence scoring** — Claude self-rates each response 0–100; displayed as a color-coded badge (green ≥85%, blue ≥70%, yellow below)
- **Conversation persistence** — chat history stored in localStorage per member; survives page refresh
- **Response time display** — each AI response shows how long Claude took (e.g. "1.2s")
- **Automatic disclaimers** — contextual disclaimers appended based on response content (medications, diagnoses, emergencies)
- **Input validation + injection prevention** — chatSafety.ts blocks prompt injection, PII, non-medical requests
- **Rate limiting** — 30 requests/hour per member IP (separate IP-level and member-level windows)
- **Console audit logging** — `[CHAT] User: '...'`, `[CHAT] AI confidence: N%`, `[CHAT] Response length: N chars`
- **Graceful error handling** — distinct messages for network error, rate limit, invalid input, and API failure

### Preventive Care Intelligence
- **Claims pattern analysis** — detects ED visit patterns, post-discharge follow-up gaps
- **Missing screening detection** — compares claims against USPSTF/ADA guidelines
- **Risk-ranked campaigns** — prioritizes by projected ROI and urgency
- **Economic justification** — projects savings with evidence-based rationale

### Population Dashboard
- Risk distribution across 50 members
- Monthly claims spend trend
- Top risk members with predicted annual cost
- Campaign performance tracking

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js App Router | Server components, route handlers |
| AI | Claude claude-opus-4-7 + extended thinking | Best reasoning for clinical triage |
| Agent framework | LangGraph (Python) | Multi-step stateful workflows |
| Python API | FastAPI + Uvicorn | Async, typed, OpenAPI docs built-in |
| Database | Supabase (PostgreSQL + pgvector) | HIPAA-compatible, RLS, semantic search |
| Validation | Zod (TS) + Pydantic (Python) | Type-safe at both layers |
| Encryption | Web Crypto API (AES-256-GCM) | Field-level PHI protection |
| Styling | Tailwind CSS v4 | Arlo brand design system |

## Setup

```bash
# 1. Frontend (Next.js)
npm install
cp .env.example .env.local
# Add ANTHROPIC_API_KEY to .env.local
npm run dev

# 2. Python backend
python3 -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn src.backend.api.server:app --port 8000 --reload

# 3. (Optional) Seed Supabase with 100 members + 500 claims
# Add SUPABASE_URL and SUPABASE_KEY to .env
PYTHONPATH=. python -m src.backend.database.seeder

# 4. Run backend tests (no API key required)
PYTHONPATH=. python src/backend/test_agents.py --quick
```

## Deployment (Vercel + Railway)

```bash
# Frontend on Vercel
npx vercel env add ANTHROPIC_API_KEY
npx vercel env add PYTHON_BACKEND_URL   # points to Railway deployment
npx vercel --prod

# Python backend on Railway / Render
# Start command: uvicorn src.backend.api.server:app --host 0.0.0.0 --port $PORT
```

## Demo Scenarios

| Member | Situation | Outcome |
|--------|-----------|---------|
| John, 67 (DM2/HTN/CKD) | Blood sugar 320, thirsty | Urgent care → HbA1c adjusted, $10,920 saved |
| Robert, 72 (CHF/Afib) | 8lb weight gain, orthopnea | Emergency → hospitalization treated |
| George, 82 (CHF/COPD/CKD) | 4 comorbidities, $60K/yr | Palliative care → ED visits -60%, $42K/yr saved |
| David, 51 (Sleep Apnea) | Sore throat, mild fever | Telehealth → URI confirmed, $205 saved |

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── triage/route.ts       # Extended thinking triage (proxies to Python)
│   │   ├── chat/route.ts         # Context-aware chat
│   │   ├── preventive/route.ts   # Claims-driven campaigns
│   │   ├── members/route.ts      # Member list API
│   │   └── dashboard/route.ts    # Population analytics
│   └── page.tsx                  # Full Arlo-branded UI
├── lib/
│   ├── mockData.ts               # 50+ members, real claims
│   ├── riskScoring.ts            # TS actuarial risk model
│   ├── claimsAnalysis.ts         # TS claims pattern detection
│   ├── validators.ts             # Input safety layer
│   ├── guardrails.ts             # Output safety layer
│   ├── encryption.ts             # AES-256-GCM field encryption
│   ├── auditLog.ts               # Immutable audit trail
│   └── rateLimiter.ts            # Rate limiting
├── proxy.ts                      # Request validation proxy
└── backend/
    ├── config.py                 # Pydantic settings
    ├── agents/
    │   ├── triage_agent.py       # LangGraph 5-node triage workflow
    │   ├── claims_agent.py       # LangGraph 4-node claims + ROI campaigns
    │   └── outcome_tracker.py    # LangGraph 5-node adherence + cost tracking
    ├── scoring/
    │   ├── risk_calculator.py    # Actuarial 0-100 risk score
    │   └── claims_analyzer.py    # ICD-10/CPT pattern detection
    ├── database/
    │   ├── client.py             # Supabase client + mock fallback
    │   ├── queries.py            # All DB query functions
    │   └── seeder.py             # 100 members + 500 claims generator
    ├── safety/
    │   ├── input_validation.py   # Injection, self-harm, PII, Rx blocking
    │   └── output_filters.py     # Diagnosis blocking, disclaimers, confidence
    ├── api/
    │   ├── server.py             # FastAPI app
    │   └── routes/
    │       ├── triage.py         # POST /api/backend/triage
    │       ├── claims.py         # POST /api/backend/claims
    │       └── health.py         # GET /api/backend/health/{id}
    └── test_agents.py            # 22 tests (no API key required)

requirements.txt                  # Python dependencies
.env.example                      # Environment variable template
SCORING.md                        # Risk scoring algorithm documentation
API_DOCS.md                       # All endpoints with examples
AGENTS.md                         # LangGraph agent workflows
```
