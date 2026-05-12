# Security Architecture — Arlo Health AI Platform

## HIPAA-Ready Architecture

The platform is designed with HIPAA technical safeguard requirements in mind:

### Access Controls
- Row-level security (RLS) on all Supabase tables — service role only via server-side clients
- No member data exposed to public/anon role
- API routes validated before any data access

### Audit Controls (§164.312(b))
- Every AI interaction logged (input length, output confidence, guardrail triggers)
- Every member data access logged with fields accessed
- Validation failures logged (injection attempts, PII detections, rate limit violations)
- Immutable audit log — no UPDATE/DELETE policies on `audit_logs` table
- PII redacted from all log entries before persistence

### Transmission Security (§164.312(e))
- HTTPS enforced in production (Vercel handles TLS termination)
- Security headers set in proxy.ts (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- CORS configured via ALLOWED_ORIGIN environment variable

### Encryption at Rest (§164.312(a)(2)(iv))
- Field-level AES-256-GCM encryption for PHI fields (conditions, medications)
- Authenticated encryption prevents tampering
- Key material never in source code — FIELD_ENCRYPTION_KEY env var only
- SHA-256 hashing for identifier correlation (member IDs in logs)

## Input Validation

### Prompt Injection Prevention
Detects and blocks attempts to override system instructions:
- "ignore previous instructions" variants
- Jailbreak patterns (DAN mode, developer mode, roleplay)
- System prompt override attempts (`[SYSTEM]`, `### System:`)
- Role-play / persona substitution attempts

### PII Detection
Blocks sensitive data from being sent to AI or logged:
- Social Security Numbers (###-##-####)
- Credit card numbers (Visa, MC, Amex patterns)
- Phone numbers
- Email addresses

### SQL Injection Prevention
- UNION SELECT, DROP TABLE, INSERT INTO, UPDATE SET patterns
- Applied to query parameters via proxy.ts
- Applied to request bodies in validators.ts

### Healthcare-Specific Validation
- Prescription requests → blocked with "contact your provider" message
- Diagnosis requests → blocked with disclaimer
- Dosing/overdose questions → blocked with Poison Control reference
- Self-harm language → immediate 988 routing (highest priority)

## Output Safety Guardrails

### Blocked Patterns (Hard Stop)
These patterns cause the response to be replaced entirely:
- Definitive diagnosis assertions ("you definitely have...")
- Prescription or dose instructions
- Telling members not to see a doctor

### Warning Patterns (Soften + Disclaimer)
- Specific medication dosages mentioned
- Uncertainty language without clinical guidance
- Missing "consult your provider" language

### Disclaimer Injection
Context-sensitive disclaimers added to responses:
- Medication mentions → dose adherence disclaimer
- Diagnosis/condition mentions → "only a provider can diagnose" disclaimer
- Emergency references → "call 911" disclaimer
- Mental health content → 988/crisis line disclaimer
- Test results → "interpret with provider" disclaimer

### Confidence Scoring
Responses scored 0-100 based on:
- Positive signals: recommends care, references member context, actionable guidance
- Negative signals: "I cannot help", uncertainty without guidance, very short responses

## Rate Limiting

| Endpoint | Per IP | Per Member |
|----------|--------|------------|
| /api/triage | 100/hour | 50/hour |
| /api/chat | — | 20/hour |
| /api/preventive | — | 10/hour |

Rate limit violations are audit logged with `rate_limit_exceeded` action.

## Data Flow

```
User Input
    │
    ▼
Proxy (proxy.ts)
├── Inject X-Request-Id
├── Security headers
├── Content-Type enforcement
└── Query param injection scan
    │
    ▼
API Route
├── Zod schema validation
├── Rate limit check
├── detectPromptInjection()
├── detectPII()
└── validateSymptomInput() / validateChatMessage()
    │
    ▼
Intelligence
├── getMemberById() + getClaimsForMember()  ← mock data
├── scoreRisk() / analyzeMemberClaims()
└── Claude API call (with member context in system prompt)
    │
    ▼
Output Safety
├── applyOutputGuardrails()
│   ├── Block harmful patterns
│   ├── Add disclaimers
│   └── Score confidence
└── redactForAuditLog()
    │
    ▼
Audit Log
└── writeAuditLog() → Supabase (or in-memory fallback)
    │
    ▼
Response
```

## Python Backend Safety Layer

The Python backend (`src/backend/safety/`) provides a second independent safety layer that runs at the agent level, before and after any Claude API call.

### Input Validation (`input_validation.py`)

Checks run in this priority order (earlier checks short-circuit later ones):
1. **Self-harm** — highest priority. Returns 988/Crisis Line message as a 200 (never a 4xx — don't fail-silent on a person in crisis)
2. **Prompt injection** — 8 patterns covering jailbreak, role substitution, instruction override, SQL injection
3. **Prescription requests** — 5 patterns; blocked with "contact your provider" message
4. **Diagnosis requests** — 4 patterns; blocked with care navigation redirect
5. **PII detection** — SSN, credit card, phone, email; redacted and flagged but not blocked (clinical context may legitimately include contact info)
6. Empty input / length limits (max 2,000 chars)

### Output Filtering (`output_filters.py`)

7 blocked patterns that replace the response entirely:
- Diagnosis assertions ("you likely have X")
- Dosing instructions ("take X mg")
- "I diagnose" / "I prescribe" language
- Dismissive advice ("you don't need a doctor")

Confidence threshold: responses below 65% confidence are flagged with a note to the user.

All output has PII redacted via `redact_pii_for_logs()` before any storage.

---

## Known Limitations (Demo vs Production)

| Feature | Demo State | Production Required |
|---------|------------|---------------------|
| Authentication | None — any memberId accepted | JWT validation, session management |
| Rate limiting | In-memory (resets on restart) | Redis/Upstash |
| Encryption key | Derived from constant in dev | Rotate via FIELD_ENCRYPTION_KEY |
| Audit persistence | In-memory + Supabase attempt | Supabase with RLS enforced |
| HIPAA BAA | Not applicable (demo) | Required with Supabase, Anthropic, Vercel |
| Python backend auth | No auth between TS and Python services | mTLS or shared secret header in production |
