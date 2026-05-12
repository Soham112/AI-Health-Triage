import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  validateSymptomInput,
  detectPromptInjection,
  detectPII,
  triageRequestSchema,
} from '@/lib/validators';
import { applyOutputGuardrails } from '@/lib/guardrails';
import {
  logTriageRequest,
  logTriageResponse,
  logValidationFailure,
} from '@/lib/auditLog';
import { checkRateLimit } from '@/lib/rateLimiter';
import {
  getMemberById,
  getClaimsForMember,
  getTriageHistoryForMember,
} from '@/lib/mockData';
import { generateSecureToken } from '@/lib/encryption';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Care setting cost benchmarks (national averages)
const CARE_COST_MAP: Record<string, { cost: number; label: string; timeToSee: string }> = {
  emergency:    { cost: 2800, label: 'Emergency Room',        timeToSee: 'Immediately' },
  urgent_care:  { cost: 280,  label: 'Urgent Care Center',    timeToSee: 'Within hours' },
  telehealth:   { cost: 75,   label: 'Telehealth Visit',      timeToSee: 'Same day' },
  pcp:          { cost: 220,  label: 'Primary Care Provider', timeToSee: '1-3 days' },
  specialist:   { cost: 380,  label: 'Specialist Referral',   timeToSee: '1-2 weeks' },
  self_care:    { cost: 0,    label: 'Self-Care at Home',     timeToSee: 'Now' },
};

export async function POST(request: NextRequest) {
  const correlationId = generateSecureToken(16);
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

  try {
    const body = await request.json();

    // ── Zod schema validation ──────────────────────────────────────────────
    const parsed = triageRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { memberId, symptoms } = parsed.data;

    // ── Rate limiting ──────────────────────────────────────────────────────
    const ipLimit = checkRateLimit(`triage:ip:${ip}`, 100, 3600);
    const memberLimit = checkRateLimit(`triage:member:${memberId}`, 50, 3600);

    if (!ipLimit.allowed || !memberLimit.allowed) {
      await logValidationFailure({ userId: memberId, reason: 'rate_limit_exceeded', action: 'rate_limit_exceeded', ipAddress: ip });
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterSeconds: Math.max(ipLimit.retryAfterSeconds, memberLimit.retryAfterSeconds) },
        { status: 429, headers: { 'Retry-After': String(Math.max(ipLimit.retryAfterSeconds, memberLimit.retryAfterSeconds)) } },
      );
    }

    // ── Input validation ───────────────────────────────────────────────────
    const injectionCheck = detectPromptInjection(symptoms);
    if (!injectionCheck.valid) {
      await logValidationFailure({ userId: memberId, reason: 'injection_attempt', action: 'injection_attempt_blocked', ipAddress: ip });
      return NextResponse.json({ error: 'Invalid input', details: injectionCheck.errors }, { status: 400 });
    }

    const piiCheck = detectPII(symptoms);
    if (!piiCheck.valid) {
      await logValidationFailure({ userId: memberId, reason: 'pii_detected', action: 'pii_detected', ipAddress: ip });
      return NextResponse.json({ error: piiCheck.errors[0] }, { status: 400 });
    }

    const symptomCheck = validateSymptomInput(symptoms);
    if (!symptomCheck.valid) {
      return NextResponse.json({ error: 'Invalid symptoms input', details: symptomCheck.errors }, { status: 400 });
    }

    // ── Member context ─────────────────────────────────────────────────────
    const member = getMemberById(memberId);
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const memberClaims = getClaimsForMember(memberId);
    const triageHistory = getTriageHistoryForMember(memberId);

    await logTriageRequest({ memberId, symptoms, ipAddress: ip, correlationId });

    // ── Build member context for Claude ───────────────────────────────────
    const recentClaims = memberClaims.slice(-5).map(c =>
      `  - ${c.date}: ${c.category} (${c.diagnosis_code}) — $${c.cost}`
    ).join('\n') || '  No recent claims on file';

    const previousTriages = triageHistory.slice(-3).map(t =>
      `  - ${t.date}: "${t.symptoms.slice(0, 60)}..." → ${t.recommended_care} (confidence: ${t.confidence}%)`
    ).join('\n') || '  No previous triage history';

    const systemPrompt = `You are Arlo, an advanced healthcare triage AI working for a health insurance company. Your role is to assess member symptoms and recommend the most clinically appropriate AND cost-effective care setting.

You have access to this member's actual medical history. Use it to provide personalized, contextual recommendations.

MEMBER PROFILE:
- Age: ${member.age} | Gender: ${member.gender} | Plan: ${member.plan_type}
- Active Conditions: ${member.conditions.length > 0 ? member.conditions.join(', ') : 'None documented'}
- Current Medications: ${member.medications.length > 0 ? member.medications.join(', ') : 'None documented'}
- Risk Score: ${member.risk_score}/100

RECENT CLAIMS HISTORY:
${recentClaims}

PREVIOUS TRIAGE HISTORY:
${previousTriages}

YOUR TASK:
1. Analyze the symptoms in context of this member's conditions and history
2. Identify red flags or warning signs that indicate emergency care
3. Consider whether these symptoms could be related to their known conditions
4. Recommend the most appropriate care setting: emergency | urgent_care | telehealth | pcp | specialist | self_care
5. Explain your clinical reasoning clearly

RESPONSE FORMAT (JSON):
{
  "recommendation": "<emergency|urgent_care|telehealth|pcp|specialist|self_care>",
  "confidence": <0-100>,
  "clinicalReasoning": "<2-3 sentences explaining WHY this care level, specific to this patient>",
  "redFlags": ["<specific red flags found, or empty array>"],
  "memberContextUsed": "<how their history/conditions influenced this recommendation>",
  "immediateActions": ["<specific steps to take right now>"],
  "followUpRecommendations": ["<additional care steps after the immediate recommendation>"],
  "alternativeRoute": "<what to do if recommended care is unavailable>",
  "estimatedTimeframe": "<how urgent — immediate/within hours/within 24h/within a week>"
}

CRITICAL RULES:
- Never provide diagnoses — only care navigation
- When in doubt about emergency symptoms, recommend emergency
- Always consider this patient's specific conditions (a diabetic with foot symptoms ≠ healthy person with foot pain)
- Do not recommend self-care for symptoms that could indicate serious conditions in high-risk patients`;

    // ── Claude API call with extended thinking ─────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      thinking: {
        type: 'enabled',
        budget_tokens: 800,
      },
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Member symptoms: ${symptomCheck.sanitized || symptoms}`,
        },
      ],
    });

    // Extract thinking and text blocks
    let reasoningText = '';
    let responseText = '';

    for (const block of claudeResponse.content) {
      if (block.type === 'thinking') {
        reasoningText = block.thinking;
      } else if (block.type === 'text') {
        responseText = block.text;
      }
    }

    // ── Parse Claude's JSON response ───────────────────────────────────────
    let triageResult: Record<string, unknown>;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      triageResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      triageResult = {
        recommendation: 'pcp',
        confidence: 60,
        clinicalReasoning: responseText,
        redFlags: [],
        immediateActions: ['Please contact your primary care provider for evaluation'],
        followUpRecommendations: [],
        estimatedTimeframe: 'within 24h',
      };
    }

    const recommendation = String(triageResult.recommendation || 'pcp');
    const confidence = Number(triageResult.confidence || 70);
    const careInfo = CARE_COST_MAP[recommendation] || CARE_COST_MAP.pcp;

    // ── Output safety guardrails ───────────────────────────────────────────
    const clinicalReasoning = String(triageResult.clinicalReasoning || '');
    const guardrailResult = applyOutputGuardrails(clinicalReasoning, { isMedicalAdvice: true, memberId });

    await logTriageResponse({
      memberId,
      recommendation,
      confidence,
      estimatedCost: careInfo.cost,
      ipAddress: ip,
      correlationId,
    });

    // ── Build cost comparison ──────────────────────────────────────────────
    const alternativeOptions = Object.entries(CARE_COST_MAP)
      .filter(([key]) => key !== recommendation)
      .slice(0, 3)
      .map(([key, val]) => ({
        option: key,
        label: val.label,
        estimatedCost: val.cost,
        timeToSee: val.timeToSee,
      }));

    return NextResponse.json({
      success: true,
      correlationId,
      recommendation: {
        careLevel: recommendation,
        label: careInfo.label,
        confidence,
        timeToSee: careInfo.timeToSee,
        estimatedCost: careInfo.cost,
      },
      clinicalReasoning: guardrailResult.safe ? guardrailResult.filteredResponse : clinicalReasoning,
      reasoning: {
        thinkingProcess: reasoningText.slice(0, 500) + (reasoningText.length > 500 ? '...' : ''),
        redFlags: triageResult.redFlags || [],
        memberContextUsed: triageResult.memberContextUsed || '',
        immediateActions: triageResult.immediateActions || [],
        followUpRecommendations: triageResult.followUpRecommendations || [],
        alternativeRoute: triageResult.alternativeRoute || '',
        estimatedTimeframe: triageResult.estimatedTimeframe || '',
      },
      memberContext: {
        age: member.age,
        riskScore: member.risk_score,
        activeConditions: member.conditions.length,
        recentClaimsCount: memberClaims.length,
        previousTriagesCount: triageHistory.length,
      },
      costComparison: {
        recommended: {
          label: careInfo.label,
          estimatedCost: careInfo.cost,
        },
        alternatives: alternativeOptions,
        potentialSavings: recommendation !== 'emergency'
          ? CARE_COST_MAP.emergency.cost - careInfo.cost
          : 0,
      },
      safetyInfo: {
        disclaimers: guardrailResult.addedDisclaimers,
        confidenceScore: guardrailResult.confidenceScore,
      },
    });

  } catch (error) {
    console.error('[Triage API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', correlationId },
      { status: 500 },
    );
  }
}
