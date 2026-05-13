@AGENTS.md

# Arlo Health AI Platform — Engineering Context

## What Was Built

A production-grade healthcare AI platform covering:

### TypeScript / Next.js Layer

1. **Triage API** (`src/app/api/triage/route.ts`) — Claude with extended thinking routes members to the right care setting (emergency/urgent/telehealth/PCP/specialist/self-care). Proxies to Python backend when `PYTHON_BACKEND_URL` is set; falls back to direct Claude call. Returns clinical reasoning, red flags, cost comparison, and confidence score.

2. **Chat API** (`src/app/api/chat/route.ts`) — Context-aware health guidance with member history in system prompt. Maintains conversation memory per session. Evaluates confidence before returning. Applies output guardrails.

3. **Preventive API** (`src/app/api/preventive/route.ts`) — Analyzes claims patterns and risk scores to generate ROI-ranked campaigns. Uses both rules engine (claimsAnalysis.ts, riskScoring.ts) and Claude for narrative justification.

4. **Risk Scoring Engine** (`src/lib/riskScoring.ts`) — Actuarial model combining condition burden (comorbidity multiplier), claims utilization (ED visits, hospitalizations), medication complexity, and age. Returns 0-100 score, tier, predicted annual cost, and preventive opportunities.

5. **Safety Layer** (`src/lib/validators.ts`, `src/lib/guardrails.ts`) — Input validation (injection detection, PII detection, unsafe healthcare requests), output filtering (blocks diagnoses, harmful dosing advice, dismissive responses), disclaimer injection.

### Python Backend Layer (`src/backend/`)

6. **LangGraph Triage Agent** (`src/backend/agents/triage_agent.py`) — 6-node workflow: validate_input → enrich_with_history → search_kb → call_claude_triage (extended thinking) → parse_and_route → calculate_cost_impact. Fetches real member claims + history from DB for context. KB rules injected into Claude system prompt before the AI call. Persists outcomes to audit log. Returns `kb_match` (matched rule ID, decision, sources) in every response.

7. **Healthcare Knowledge Base** (`src/backend/knowledge_base/`) — `healthcare_kb_decision_rules.json` holds 50 verified decision rules across four categories (emergency, insurance, screening, drug). `kb_search.py` provides `load_decision_rules()` (called once at server startup) and `search_kb(query, top_k)` (keyword scoring with stop-word filtering and phrase-level bonuses). Emergency rules with confidence > 0.95 are injected first in the Claude prompt. `kb_loader.py` handles the richer triage/conditions/preventive JSON files with embedding and Supabase storage support.

8. **LangGraph Claims Agent** (`src/backend/agents/claims_agent.py`) — 4-node workflow: fetch_claims → parse_and_score → call_claude_insights → rank_campaigns. Scoring engine runs first; Claude receives structured analysis (not raw CPT codes) and generates narrative campaigns with ROI justification.

9. **LangGraph Outcome Tracker** (`src/backend/agents/outcome_tracker.py`) — 5-node workflow tracking adherence rate, cost savings realized vs. missed, and risk score adjustment based on engagement behavior. Feedback loop for the AI to improve over time.

10. **Actuarial Risk Scoring Engine** (`src/backend/scoring/risk_calculator.py`) — 5-dimension weighted model (condition burden 30%, utilization 30%, medication complexity 20%, age 10%, SDOH 10%) with comorbidity multiplier. See SCORING.md for full methodology.

11. **Claims Analyzer** (`src/backend/scoring/claims_analyzer.py`) — ICD-10 prefix matching, CPT code bucketing, ER overutilization detection, 30-day readmission detection, condition-specific prevention gap identification.

12. **FastAPI Backend Server** (`src/backend/api/server.py`) — Serves `/api/backend/triage`, `/api/backend/claims`, `/api/backend/health/{id}`, `/api/backend/outcomes/{id}`. CORS configured for Next.js origin. Calls `load_decision_rules()` at startup to cache the KB into memory.

13. **Supabase Data Layer** (`src/backend/database/`) — Lazy-init client with in-memory mock fallback. Seeder generates 100 members + 500+ clinically realistic claims. All queries have retry logic with exponential backoff.

14. **Python Safety Layer** (`src/backend/safety/`) — `input_validation.py`: self-harm detection (returns 988), injection/jailbreak patterns, PII redaction, prescription/diagnosis request blocking. `output_filters.py`: diagnosis assertion blocking, confidence flagging, disclaimer injection.

## Key Design Decisions

### No Diagnosis, Ever
The system is explicitly designed to navigate care (where to go) not diagnose (what you have). All guardrail patterns and system prompts enforce this in both TypeScript and Python layers. Member-specific context is used to route more accurately (a diabetic with foot symptoms → different triage than a healthy person), not to diagnose.

### Python Backend as Intelligence Layer
The Python backend (`src/backend/`) is where the real actuarial intelligence lives — LangGraph multi-step workflows, comorbidity-aware risk scoring, ICD-10 pattern detection, and ROI-ranked campaign generation. The TypeScript layer handles auth, rate limiting, and UI concerns. The triage route proxies to Python when available and falls back to direct Claude if not.

### Mock Data as First-Class
`src/lib/mockData.ts` has 50+ realistic members with real CPT/ICD-10 codes. The Python seeder (`src/backend/database/seeder.py`) generates 100 members + 500+ claims for Supabase. The intelligence layers run on actual medical data structures either way.

### Lazy Supabase Initialization
Both TypeScript and Python Supabase clients use lazy init with in-memory fallback. This allows the entire platform to run without any environment variables set (useful for demos). The audit log writes to in-memory buffer as fallback.

### Extended Thinking for Triage
Both the TypeScript triage route and the Python LangGraph triage agent use `thinking: { type: 'enabled', budget_tokens: 800 }`. Clinical triage requires genuine multi-step reasoning. The thinking text is returned to the frontend for transparency.

### Rate Limiting Architecture
TypeScript layer: in-memory Map (swap for Redis by changing `store.get/set`). Limits: triage 100/hr per IP + 50/hr per member, chat 20/hr, preventive 10/hr. Python layer: FastAPI endpoint validation + input guardrails serve as the second defense layer.

## Safety Considerations

1. **Self-harm routing** — Pattern match for self-harm language immediately returns 988 (Suicide & Crisis Lifeline) regardless of other validation. This is the highest-priority guardrail.

2. **PII never logged** — `redactPIIForLogs()` is called on all inputs before audit log writes. The guardrail output filter also redacts PII from AI outputs before they're stored.

3. **Prescription/diagnosis blocking** — Explicit patterns block any response that claims to diagnose or prescribe. These trigger `blockedReason` in the guardrail result and return a safe alternative response.

4. **Comorbidity context in triage** — The system prompt explicitly tells Claude that the same symptoms mean different things for different patients. A patient with CHF + 2 prior hospitalizations showing leg swelling gets emergency routing; a healthy 25-year-old with the same symptom might get PCP routing.

## Production Next Steps

1. **Auth** — Wire `jose` JWT verification into the proxy. Currently all member IDs are accepted — in production, validate that the requesting user owns the member ID.

2. **Redis for rate limiting** — Replace in-memory Map in `rateLimiter.ts` with Upstash Redis.

3. **Supabase for persistence** — Schema in `schema.sql`. Python queries layer (`src/backend/database/queries.py`) is fully wired — just add `SUPABASE_URL` + `SUPABASE_KEY`. Run seeder once: `PYTHONPATH=. python -m src.backend.database.seeder`.

4. **Embeddings** — `src/lib/embedding.ts` has the pgvector integration scaffolded. In production, replace `generateEmbedding()` with an OpenAI/Cohere embeddings API call.

5. **Encryption key rotation** — `FIELD_ENCRYPTION_KEY` should be rotated periodically. Implement key versioning in `encryption.ts`.

6. **Monitoring** — Add Datadog/Sentry for error tracking. The audit log structure is designed to export to SIEM for HIPAA audit requirements.

7. **Deploy Python backend** — Run alongside Next.js on Railway/Render, or as a Vercel Python serverless function. Set `PYTHON_BACKEND_URL` in Next.js environment to activate the LangGraph agent path.

## Running Locally

```bash
# Frontend (Next.js)
npm install && npm run dev

# Python backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn src.backend.api.server:app --port 8000 --reload

# Tests (no API key needed)
PYTHONPATH=. python src/backend/test_agents.py --quick
```
