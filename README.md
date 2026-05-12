# Arlo Health — AI Healthcare Platform

A production-grade healthcare AI platform demonstrating full-stack ownership: intelligent triage with Claude extended thinking, context-aware health chat, claims-driven preventive care, and a population analytics dashboard — all built with safety-first, HIPAA-ready architecture.

## What This Proves

- **End-to-end ownership** — data modeling, risk scoring algorithms, AI integration, safety layer, API design, frontend, and deployment
- **Healthcare domain knowledge** — real CPT/ICD-10 codes, clinical triage logic, evidence-based preventive care guidelines, medication complexity awareness
- **Production-grade thinking** — rate limiting, audit logging, prompt injection prevention, PII detection, output guardrails, field-level encryption
- **Claude mastery** — extended thinking for clinical reasoning, context injection with member history, self-evaluating confidence scoring, output guardrails

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
           │                            │
┌──────────▼──────────┐    ┌────────────▼─────────────────┐
│  Safety Layer        │    │  Intelligence Layer           │
│  - validators.ts     │    │  - riskScoring.ts            │
│  - guardrails.ts     │    │  - claimsAnalysis.ts         │
│  - encryption.ts     │    │  - Claude API (extended      │
│  - auditLog.ts       │    │    thinking enabled)         │
└──────────┬──────────┘    └────────────┬─────────────────┘
           │                            │
┌──────────▼────────────────────────────▼─────────────────┐
│               Data Layer                                  │
│  Mock Data (50+ members, real claims, triage history)    │
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
- **Context-aware** — system prompt includes member's actual conditions and medications
- **Conversation memory** — maintains session continuity across turns
- **Confidence scoring** — evaluates response quality before returning
- **Safety guardrails** — blocks harmful advice, adds evidence-based disclaimers

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
| Framework | Next.js 16 App Router | Server components, route handlers |
| AI | Claude claude-sonnet-4-6 + extended thinking | Best reasoning for clinical triage |
| Database | Supabase (PostgreSQL + pgvector) | HIPAA-compatible, RLS, semantic search |
| Validation | Zod + custom medical validators | Type-safe + healthcare-specific rules |
| Encryption | Web Crypto API (AES-256-GCM) | Field-level PHI protection |
| Styling | Tailwind CSS v4 | Arlo brand design system |

## Setup

```bash
# Install dependencies (all local to node_modules — no global installs)
npm install

# Configure environment
# Edit .env.local and add your ANTHROPIC_API_KEY

# Run development server
npm run dev

# (Optional) Set up Supabase
# Run schema.sql in your Supabase project SQL editor
# Add Supabase credentials to .env.local
```

## Deployment (Vercel)

```bash
npx vercel env add ANTHROPIC_API_KEY
npx vercel --prod
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
│   │   ├── triage/route.ts     # Extended thinking triage
│   │   ├── chat/route.ts       # Context-aware chat
│   │   ├── preventive/route.ts # Claims-driven campaigns
│   │   ├── members/route.ts    # Member list API
│   │   └── dashboard/route.ts  # Population analytics
│   └── page.tsx                # Full Arlo-branded UI
├── lib/
│   ├── mockData.ts             # 50+ members, 50 claims
│   ├── riskScoring.ts          # Actuarial risk model
│   ├── claimsAnalysis.ts       # Claims pattern detection
│   ├── validators.ts           # Input safety layer
│   ├── guardrails.ts           # Output safety layer
│   ├── encryption.ts           # AES-256-GCM field encryption
│   ├── auditLog.ts             # Immutable audit trail
│   └── rateLimiter.ts          # Rate limiting
└── proxy.ts                    # Request validation proxy
```
