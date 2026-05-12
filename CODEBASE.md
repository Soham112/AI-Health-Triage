# Codebase Deep-Dive — Arlo Health AI Platform

## File-by-File Breakdown

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
4. Claude API — extended thinking enabled, system prompt includes full member context
5. Parse JSON response from Claude
6. Apply output guardrails to clinical reasoning
7. Audit log (response with recommendation + confidence)
8. Return: recommendation, clinical reasoning, reasoning breakdown, cost comparison, safety info

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
    → Build system prompt (member context injected)
    → Claude claude-sonnet-4-6 + extended thinking
    → Parse JSON response
    → applyOutputGuardrails()
    → logTriageResponse() [audit]
    → Return TriageResult
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
