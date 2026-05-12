@AGENTS.md

# Arlo Health AI Platform — Engineering Context

## What Was Built

A production-grade healthcare AI platform covering:

1. **Triage API** (`src/app/api/triage/route.ts`) — Claude with extended thinking routes members to the right care setting (emergency/urgent/telehealth/PCP/specialist/self-care). Uses member's actual conditions, medications, and claims history. Returns clinical reasoning, red flags, cost comparison, and confidence score.

2. **Chat API** (`src/app/api/chat/route.ts`) — Context-aware health guidance with member history in system prompt. Maintains conversation memory per session. Evaluates confidence before returning. Applies output guardrails.

3. **Preventive API** (`src/app/api/preventive/route.ts`) — Analyzes claims patterns and risk scores to generate ROI-ranked campaigns. Uses both rules engine (claimsAnalysis.ts, riskScoring.ts) and Claude for narrative justification.

4. **Risk Scoring Engine** (`src/lib/riskScoring.ts`) — Actuarial model combining condition burden (comorbidity multiplier), claims utilization (ED visits, hospitalizations), medication complexity, and age. Returns 0-100 score, tier, predicted annual cost, and preventive opportunities.

5. **Safety Layer** (`src/lib/validators.ts`, `src/lib/guardrails.ts`) — Input validation (injection detection, PII detection, unsafe healthcare requests), output filtering (blocks diagnoses, harmful dosing advice, dismissive responses), disclaimer injection.

## Key Design Decisions

### No Diagnosis, Ever
The system is explicitly designed to navigate care (where to go) not diagnose (what you have). All guardrail patterns and system prompts enforce this. Member-specific context is used to route more accurately (a diabetic with foot symptoms → different triage than a healthy person), not to diagnose.

### Mock Data as First-Class
`src/lib/mockData.ts` has 50+ realistic members with real CPT/ICD-10 codes. This means the intelligence is real — the risk scoring engine runs on actual medical data structures, the claims patterns are clinically accurate.

### Lazy Supabase Initialization
Supabase client uses a Proxy to defer initialization until first use. This allows the app to run in mock-data mode without environment variables set. The audit log also writes to an in-memory buffer as fallback.

### Extended Thinking for Triage
The triage API uses `thinking: { type: 'enabled', budget_tokens: 800 }`. This is important because clinical triage requires genuine multi-step reasoning (considering context, weighing red flags, evaluating risk factors). The thinking text is included in the response for transparency.

### Rate Limiting Architecture
Currently in-memory (Map). The structure is identical to Redis — just swap `store.get/set` for `redis.get/set`. Rate limits: triage 100/hr per IP + 50/hr per member, chat 20/hr per member, preventive 10/hr per member.

## Safety Considerations

1. **Self-harm routing** — Pattern match for self-harm language immediately returns 988 (Suicide & Crisis Lifeline) regardless of other validation. This is the highest-priority guardrail.

2. **PII never logged** — `redactPIIForLogs()` is called on all inputs before audit log writes. The guardrail output filter also redacts PII from AI outputs before they're stored.

3. **Prescription/diagnosis blocking** — Explicit patterns block any response that claims to diagnose or prescribe. These trigger `blockedReason` in the guardrail result and return a safe alternative response.

4. **Comorbidity context in triage** — The system prompt explicitly tells Claude that the same symptoms mean different things for different patients. A patient with CHF + 2 prior hospitalizations showing leg swelling gets emergency routing; a healthy 25-year-old with the same symptom might get PCP routing.

## Production Next Steps

1. **Auth** — Wire `jose` JWT verification into the proxy. Currently all member IDs are accepted — in production, validate that the requesting user owns the member ID.

2. **Redis for rate limiting** — Replace in-memory Map in `rateLimiter.ts` with Upstash Redis.

3. **Supabase for persistence** — Chat history and triage outcomes should be written to DB. The schema is complete in `schema.sql`.

4. **Embeddings** — `src/lib/embedding.ts` has the pgvector integration scaffolded. In production, replace `generateEmbedding()` with an OpenAI/Cohere embeddings API call.

5. **Encryption key rotation** — `FIELD_ENCRYPTION_KEY` should be rotated periodically. Implement key versioning in `encryption.ts`.

6. **Monitoring** — Add Datadog/Sentry for error tracking. The audit log structure is designed to export to SIEM for HIPAA audit requirements.
