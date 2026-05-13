# Arlo Health — AI Healthcare Platform

Production-grade healthcare AI: intelligent triage with Claude extended thinking, context-aware health chat, claims-driven preventive care, and population analytics — built with HIPAA-ready, safety-first architecture.

**Deployed:** Vercel (frontend) + Railway (Python backend) + Supabase (data)

---

## Quick Start

```bash
# Frontend
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY
npm run dev

# Python backend (separate terminal)
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn src.backend.api.server:app --port 8000 --reload

# Tests (no API key required)
PYTHONPATH=. python src/backend/test_agents.py --quick
```

Optional — seed Supabase with 100 members + 500 claims:
```bash
# Add SUPABASE_URL + SUPABASE_KEY to .env, then:
PYTHONPATH=. python -m src.backend.database.seeder
```

---

## Features

### Triage Engine
Routes symptoms to emergency / urgent care / telehealth / PCP / specialist / self-care using Claude Opus with extended thinking. Injects member's real conditions, medications, and claims history. Returns clinical reasoning, red flags, cost comparison, and a matched KB rule (`kb_match`).

### Health Chat
Context-aware guidance via Claude Haiku. System prompt includes member's conditions and risk tier. Self-rates confidence 0–100 (green ≥85%, blue ≥70%, yellow below). Conversation persists in localStorage. PII/injection blocking via `chatSafety.ts`.

### Preventive Care Intelligence
Detects ICD-10 patterns, USPSTF screening gaps, and ER overutilization from claims history. Generates ROI-ranked campaigns with economic justification. LangGraph claims agent runs scoring engine first; Claude writes narrative on top of structured output.

### Population Dashboard
Risk distribution, monthly spend trend, top-risk members, campaign performance — across all 50+ members.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15 App Router + Tailwind CSS v4 |
| AI | Claude Opus 4 (extended thinking) + Claude Haiku 4.5 |
| Agent framework | LangGraph (Python) — 3 multi-node workflows |
| Python API | FastAPI + Uvicorn |
| Database | Supabase (PostgreSQL + pgvector) |
| Validation | Zod (TS) + Pydantic (Python) |
| Encryption | Web Crypto API (AES-256-GCM) |

---

## Deployment

```bash
# Frontend → Vercel
npx vercel env add ANTHROPIC_API_KEY
npx vercel env add PYTHON_BACKEND_URL   # Railway URL
npx vercel --prod

# Python backend → Railway / Render
# Start command: uvicorn src.backend.api.server:app --host 0.0.0.0 --port $PORT
```

When `PYTHON_BACKEND_URL` is set, triage proxies to the LangGraph agent. Without it, the TS fallback handles all requests directly.

---

## Safety

- Self-harm detection → immediate 988 return (highest priority, bypasses all other logic)
- PII redacted before any audit log write
- Diagnosis/prescription blocking in both TS and Python output filters
- Comorbidity-aware triage (same symptom → different routing based on member risk profile)

See [SECURITY.md](SECURITY.md) for the full threat model.

---

## Docs

| File | Contents |
|------|----------|
| [AGENTS.md](AGENTS.md) | LangGraph agent workflows (node-by-node) |
| [SCORING.md](SCORING.md) | Actuarial risk scoring methodology |
| [SECURITY.md](SECURITY.md) | Threat model, guardrails, HIPAA notes |
| [API_DOCS.md](API_DOCS.md) | All endpoints with request/response examples |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design diagram and data flow |

---

## Demo Scenarios

| Member | Situation | Triage Outcome |
|--------|-----------|----------------|
| John, 67 (DM2/HTN/CKD) | Blood sugar 320, thirsty | Urgent care → HbA1c adjusted |
| Robert, 72 (CHF/Afib) | 8lb weight gain, orthopnea | Emergency → hospitalization |
| George, 82 (CHF/COPD/CKD) | 4 comorbidities, $60K/yr | Palliative care referral |
| David, 51 (Sleep Apnea) | Sore throat, mild fever | Telehealth → URI, $205 saved |
