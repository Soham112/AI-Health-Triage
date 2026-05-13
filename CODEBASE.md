# Codebase Deep-Dive — Arlo Health AI Platform

## File-by-File Breakdown

> The platform has two layers: TypeScript (Next.js) for the frontend + API gateway, and Python (FastAPI + LangGraph) for the backend intelligence. See API_DOCS.md for endpoint reference and SCORING.md for the risk algorithm.

### `src/lib/mockData.ts`
50 member profiles with realistic clinical profiles, 50+ claims with real CPT/ICD-10 codes, triage history, chat history, and preventive campaigns.

Key design: Members are stratified by risk (risk scores 5-98), conditions span chronic disease categories (cardiovascular, metabolic, renal, pulmonary, neurological, oncology), and medications are clinically accurate. Claims reference real procedure and diagnosis codes so the analysis layer runs on authentic data structures.

### `src/lib/riskScoring.ts`

**Algorithm:**

```
rawScore = ageScore + conditionScore × comorbidityMultiplier + medScore + utilizationScore + costScore

ageScore: 0-20 (graduated by decade, 60+)
conditionScore: per-condition weights (CHF=25, CKD4=28, DM2=20...) × comorbidity multiplier
  comorbidityMultiplier: 1.0 (1 condition) → 1.4 (4+ conditions)
medScore: 0-12 based on complex medication count (anticoagulants, biologics, insulins)
utilizationScore: ED visits (7/14/20) + hospitalizations (15/25) in 12mo
costScore: 0-10 based on annual spend threshold

overallRisk = min(100, rawScore)
riskTier: critical≥85, high≥65, moderate≥35, low<35
```

**Predicted cost:** Weighted blend of tier baseline ($2.5K-$45K) and 110% of actual recent spend.

**Preventive opportunities:** Rule-based engine checking for missing screenings (HbA1c, eye exam, foot exam, colonoscopy, mammography) and unmet care needs (CHF monitoring enrollment, COPD disease management, palliative care for Stage 4 CHF).

### `src/lib/claimsAnalysis.ts`

**Pattern detection:**
1. Repeated ED visits for same diagnosis code → disease instability signal
2. Hospitalization without 30-day follow-up visit → readmission risk
3. High-cost specialty medications (biologics, anticoagulants) → adherence/step-therapy opportunity
4. High diagnostic utilization → potential duplicate testing

**Missing screening detection:** Maps member conditions → required CPT codes → checks if any appear in claims. If not, flags as gap.

**Adherence gaps:** Office visit frequency below threshold for chronic condition burden; no lab claims despite being on medications requiring monitoring.

### `src/lib/validators.ts`

Four independent validation functions, each returning `{ valid, errors, warnings, sanitized }`:

- `validateSymptomInput()` — must have medical terms, minimum length, alpha ratio check
- `detectPromptInjection()` — 17+ regex patterns covering jailbreak attempts, role substitution
- `detectPII()` — SSN, credit card, phone, email patterns
- `detectUnsafeHealthcareRequest()` — prescription requests, diagnosis requests, overdose inquiries, self-harm

`validateChatMessage()` composes all four for the chat endpoint.

### `src/lib/guardrails.ts`

**Output filter pipeline:**

1. Hard blocks — 9 patterns that replace the entire response with a safe alternative
2. Soft warnings — 4 patterns that add disclaimers without blocking
3. Contextual disclaimers — 7 topic-triggered disclaimer types
4. Confidence scoring — 0-100 quality score based on positive/negative signals and response length

### `src/app/api/triage/route.ts`

**Request flow:**
1. Zod parse → rate limit (IP + member) → injection check → PII check → symptom validation
2. Member lookup → claims → triage history
3. Audit log (request)
4. Try Python backend (LangGraph 6-node agent with KB search + extended thinking); pass through full response including `kbMatch`
5. Fallback: Claude API — extended thinking enabled, system prompt includes full member context
6. Parse JSON response from Claude
7. Apply output guardrails to clinical reasoning
8. Audit log (response with recommendation + confidence)
9. Return: recommendation, clinical reasoning, reasoning breakdown, cost comparison, safety info, kbMatch

**Extended thinking:** Budget of 800 tokens. The thinking text is included in the response (`reasoning.thinkingProcess`) truncated to 500 chars for transparency.

### `src/app/api/chat/route.ts`

**Conversation management:** In-memory Map (session → message history). Last 10 turns included in each Claude call. Each turn stored after response.

**System prompt strategy:** Member's exact conditions, medications, risk score, recent claims, and prior triage sessions injected. High-risk members (score 75+) get an explicit note to err on the side of caution.

### `src/app/api/preventive/route.ts`

**Dual intelligence:** Both the rules engine (claimsAnalysis + riskScoring) and Claude analyze the member. The rules engine provides structured findings; Claude provides narrative justification and campaign details with evidence base.

**Graceful degradation:** If ANTHROPIC_API_KEY not set, returns rules-engine-only result. If Supabase not set, uses mock data. The response shape is identical either way.

## Data Flow Diagrams

### Triage Flow
```
POST /api/triage { memberId, symptoms }
    → Zod validation
    → Rate limit check
    → Injection + PII scan
    → Symptom medical term check
    → getMemberById() [mockData]
    → getClaimsForMember() [mockData]
    → getTriageHistoryForMember() [mockData]
    → callPythonBackend() [if PYTHON_BACKEND_URL set]
          → validate_input (safety layer)
          → enrich_with_history (DB + risk score)
          → search_kb (KB_RULES cache → top 3 matches, log rule ID)
          → call_claude_triage (member context + KB rules injected into system prompt)
          → parse_and_route (JSON parse + severity override)
          → calculate_cost_impact (cost comparison + persist + output filter)
          → return { recommendation, reasoning, kb_match, ... }
    → [fallback] Build system prompt (member context injected)
    → [fallback] Claude claude-sonnet-4-6 + extended thinking
    → [fallback] Parse JSON response
    → applyOutputGuardrails()
    → logTriageResponse() [audit]
    → Return TriageResult (includes kbMatch when Python backend active)
```

### Risk Score Flow
```
scoreRisk(member, claims)
    → ageScore (age brackets)
    → conditionScore × comorbidityMultiplier
    → medScore (complex medication count)
    → utilizationScore (12mo ED + hospitalizations)
    → costScore (annual spend)
    → normalize to 0-100
    → tier assignment
    → identifyPreventiveOpportunities()
    → buildRiskDriverSummary()
    → return RiskScoreResult
```

## Edge Case Handling

| Scenario | Handling |
|----------|----------|
| Member not found | 404 with no data leakage |
| No claims history | Risk model uses tier baseline only |
| Claude API timeout | try/catch → 500 with correlation ID |
| Supabase unavailable | In-memory audit buffer, mock data fallback |
| Injection detected | 400 + audit log `injection_attempt_blocked` |
| Self-harm detected | 200 with 988 routing message (not a 400 — never fail-silent on this) |
| Rate limit hit | 429 with `Retry-After` header |
| PII in input | 400 with redacted error message (PII never echoed back) |
| Harmful AI output | Replace with safe alternative, log `guardrail_triggered` |
| Python backend unavailable | TS triage route falls back to direct Claude call silently |

---

## Python Backend (`src/backend/`)

### `src/backend/knowledge_base/kb_search.py`

Loads `healthcare_kb_decision_rules.json` (50 rules: emergency, insurance, screening, drug) into a module-level `KB_RULES` cache at server startup via `load_decision_rules()`. `search_kb(query, top_k)` scores each rule by keyword overlap (stop-word filtered, phrase-level bonus, whole-word match bonus) and returns the top matches sorted by score then confidence. `format_kb_rules_for_prompt(rules)` renders matches into a structured block for system prompt injection.

### `src/backend/agents/triage_agent.py`

**LangGraph workflow (6 nodes):**
```
validate_input → enrich_with_history → search_kb → call_claude_triage → parse_and_route → calculate_cost_impact
```
- `validate_input`: runs Python safety layer — self-harm (returns 988 immediately), injection, PII redaction
- `enrich_with_history`: fetches member, 50 claims, 5 prior triages; computes current risk score
- `search_kb`: calls `search_kb(symptoms, top_k=3)`; logs matched rule ID + confidence; stores top match as `kb_match` in state
- `call_claude_triage`: `claude-opus-4-7` + `thinking: {budget_tokens: 800}`. System prompt = base TRIAGE_SYSTEM_PROMPT + KB rules block (emergency rules with confidence >0.95 injected first). Forces JSON output.
- `parse_and_route`: parses JSON, validates against enum, applies severity override
- `calculate_cost_impact`: compares recommended vs. ER cost; persists outcome; applies output filter

### `src/backend/agents/claims_agent.py`

**LangGraph workflow (4 nodes):**
```
fetch_claims → parse_and_score → call_claude_insights → rank_campaigns
```
Key design: Claude receives *structured analysis output* from the scoring engine — not raw CPT codes. This produces more accurate, evidence-grounded campaign narratives. Fallback to scoring-engine-only campaigns if Claude JSON fails.

### `src/backend/agents/outcome_tracker.py`

**LangGraph workflow (5 nodes):**
```
load_outcomes → compute_adherence → calculate_cost_impact → adjust_risk_score → summarize
```
No Claude call — pure actuarial logic. Adherence ≥80% → -5 risk pts; <40% → +5 risk pts. This is the feedback loop that lets risk scores evolve based on member engagement.

### `src/backend/scoring/risk_calculator.py`

Five-dimension weighted model. See SCORING.md for full algorithm with example calculation. Key: comorbidity multiplier (1.15–1.35×) reflects clinical reality that conditions interact non-linearly.

### `src/backend/scoring/claims_analyzer.py`

ICD-10 prefix matching → condition labels. CPT code bucketing → care setting categories. Pattern detection: ER overuse (≥3 visits), no PCP follow-up post-hospitalization, 30-day readmission, zero preventive visits. Condition-specific prevention gaps with estimated savings.

### `src/backend/database/`

- `client.py`: lazy Supabase init, `MockSupabase` fallback that mirrors the supabase-py API surface exactly
- `queries.py`: typed functions for all DB operations; all have retry with exponential backoff
- `seeder.py`: reproducible (seeded random) generation of 100 members + 500+ claims. Run once: `PYTHONPATH=. python -m src.backend.database.seeder`

### `src/backend/safety/`

Python safety layer mirrors the TypeScript layer but runs at the agent level:
- `input_validation.py`: 7 check types, self-harm is checked first and short-circuits all other logic
- `output_filters.py`: 7 blocked patterns (diagnosis assertions, dosing instructions, dismissive advice), confidence threshold flagging, disclaimer injection
