import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { validateChatMessage, detectPromptInjection } from '@/lib/validators';
import { applyOutputGuardrails } from '@/lib/guardrails';
import { logChatMessage, logValidationFailure, writeAuditLog } from '@/lib/auditLog';
import { checkRateLimit } from '@/lib/rateLimiter';
import { getMemberById, getClaimsForMember, getTriageHistoryForMember, MOCK_CHAT_HISTORY } from '@/lib/mockData';
import { generateSecureToken } from '@/lib/encryption';
import { generateConfidence, stripConfidenceTag, validateInput as chatSafetyValidate } from '@/lib/chatSafety';
import { logChatMessage as consoleChatLog, logRateLimit, logSafetyBlock } from '@/lib/chatLogging';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory conversation store (use Redis/Supabase in production)
const conversationStore = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

export async function POST(request: NextRequest) {
  const correlationId = generateSecureToken(16);
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const body = await request.json();
    const { memberId, message, sessionId } = body;

    if (!memberId || !message) {
      return NextResponse.json({ error: 'memberId and message are required' }, { status: 400 });
    }

    // ── Rate limiting ──────────────────────────────────────────────────────
    const ipLimit = checkRateLimit(`chat:ip:${ip}`, 30, 3600);
    if (!ipLimit.allowed) {
      logRateLimit(memberId, ip);
      return NextResponse.json(
        { error: 'Too many requests. Wait a moment before trying again.', retryAfterSeconds: ipLimit.retryAfterSeconds },
        { status: 429 },
      );
    }

    const memberLimit = checkRateLimit(`chat:member:${memberId}`, 30, 3600);
    if (!memberLimit.allowed) {
      logRateLimit(memberId, ip);
      await logValidationFailure({ userId: memberId, reason: 'rate_limit_exceeded', action: 'rate_limit_exceeded', ipAddress: ip });
      return NextResponse.json(
        { error: 'Rate limit exceeded. You can send up to 30 messages per hour.', retryAfterSeconds: memberLimit.retryAfterSeconds },
        { status: 429 },
      );
    }

    // ── Input validation ───────────────────────────────────────────────────
    const chatSafetyCheck = chatSafetyValidate(message);
    if (!chatSafetyCheck.valid) {
      logSafetyBlock(memberId, chatSafetyCheck.error || 'input_rejected');
      return NextResponse.json({ error: chatSafetyCheck.error || 'Please ask a health-related question.' }, { status: 400 });
    }

    const injectionCheck = detectPromptInjection(message);
    if (!injectionCheck.valid) {
      await logValidationFailure({ userId: memberId, reason: 'injection_detected', action: 'injection_attempt_blocked', ipAddress: ip });
      return NextResponse.json({ error: 'Invalid input detected. Please ask a health-related question.' }, { status: 400 });
    }

    const validation = validateChatMessage(message);
    if (!validation.valid) {
      const isHarmful = validation.errors.some(e => e.includes('988') || e.includes('911') || e.includes('prescription'));
      return NextResponse.json(
        {
          error: validation.errors[0],
          safetyMessage: isHarmful,
          warnings: validation.warnings,
        },
        { status: isHarmful ? 200 : 400 },
      );
    }

    // ── Member context ─────────────────────────────────────────────────────
    const member = getMemberById(memberId);
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const memberClaims = getClaimsForMember(memberId);
    const triageHistory = getTriageHistoryForMember(memberId);
    const chatHistory = MOCK_CHAT_HISTORY.filter(c => c.member_id === memberId);

    await logChatMessage({ memberId, messageLength: message.length, ipAddress: ip, correlationId });

    // ── Build session conversation ─────────────────────────────────────────
    const session = sessionId || memberId;
    if (!conversationStore.has(session)) {
      conversationStore.set(session, []);
    }
    const conversation = conversationStore.get(session)!;

    // Keep last 10 turns to manage context window
    const recentConversation = conversation.slice(-10);

    // ── Build clinical context for system prompt ───────────────────────────
    const topClaims = memberClaims.slice(-6).map(c =>
      `  - ${c.date}: ${c.category} for ${c.diagnosis_code} — $${c.cost}`
    ).join('\n') || '  No recent claims';

    const recentTriages = triageHistory.slice(-2).map(t =>
      `  - ${t.date}: ${t.symptoms.slice(0, 80)}... → Recommended ${t.recommended_care}`
    ).join('\n') || '  No recent triage history';

    const pastChats = chatHistory.slice(-2).map(c =>
      `  Member asked: "${c.message.slice(0, 60)}..."\n  Arlo responded with guidance about: ${c.response.slice(0, 80)}...`
    ).join('\n') || '  No previous conversations';

    const systemPrompt = `You are Arlo, a health AI for a health insurance plan.

MEMBER CONTEXT:
- Age: ${member.age} | Gender: ${member.gender} | Plan: ${member.plan_type}
- Active Conditions: ${member.conditions.length > 0 ? member.conditions.join(', ') : 'None documented'}
- Current Medications: ${member.medications.length > 0 ? member.medications.join(', ') : 'None documented'}
- Risk Score: ${member.risk_score}/100${member.risk_score >= 75 ? ' (HIGH RISK)' : member.risk_score >= 50 ? ' (moderate risk)' : ' (low risk)'}

RECENT CLAIMS:
${topClaims}

RULES — follow every one of these exactly:

1. EMERGENCY SYMPTOMS (chest pain, stroke signs, severe bleeding, anaphylaxis, etc.):
   - Respond with one short sentence: what the emergency is.
   - End with: [Call 911] or [Go to ER]
   - Do NOT explain further. Do NOT ask follow-up questions.

2. HEALTH QUESTIONS (conditions, medications, lab results, risk score, screenings):
   - Answer in 2-3 sentences max. Use member context to personalize.
   - Reference their specific conditions or medications when relevant.
   - End with one or two action buttons like [Learn More] or [Schedule with Doctor].

3. FORMATTING — absolute rules:
   - No markdown. No *, **, ***, no ### headers, no bullet lists with -.
   - No long disclaimers. One sentence of caution is enough; put full disclaimer behind [Legal Info].
   - Plain text only. Buttons use [Button Label] format.
   - Never start a response with "I" or "As an AI".

4. NEVER:
   - Diagnose a condition.
   - Prescribe or adjust medication doses.
   - Say "you don't need to see a doctor" for serious symptoms.

CONFIDENCE RATING: At the very end of your response, on its own line, write exactly: [CONFIDENCE: N] where N is 0-100.

EXAMPLES:

Q: "I have chest pain and can't breathe"
A: This sounds like a medical emergency.
[Call 911] [Find Nearest ER]

Q: "What's my risk score mean?"
A: Your risk score is ${member.risk_score}/100${member.risk_score >= 75 ? ', which is high' : member.risk_score >= 50 ? ', which is moderate' : ', which is low'}. ${member.conditions.length > 0 ? `This reflects your ${member.conditions.slice(0, 2).join(' and ')}.` : 'Keep up your preventive care.'} Let's focus on prevention.
[View Preventive Screenings] [Schedule with Doctor]

Q: "Can I take ibuprofen with my current meds?"
A: ${member.medications.length > 0 ? `Given you're on ${member.medications[0]}, check with your doctor before adding ibuprofen — it can interact with some medications.` : 'Ibuprofen is generally safe for short-term use; check with your doctor if you take it regularly.'} Your pharmacist can also advise.
[Message Your Doctor] [Drug Interactions]`;

    // ── Claude API call ────────────────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...recentConversation,
      { role: 'user', content: validation.sanitized || message },
    ];

    const callStart = Date.now();
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });
    const responseTimeMs = Date.now() - callStart;

    const rawResponseText = claudeResponse.content[0]?.type === 'text'
      ? claudeResponse.content[0].text
      : '';

    // Extract Claude's self-reported confidence, then strip the tag before guardrails
    const selfConfidence = generateConfidence(rawResponseText);
    const responseText = stripConfidenceTag(rawResponseText);

    // ── Apply guardrails ───────────────────────────────────────────────────
    const guardrailResult = applyOutputGuardrails(responseText, { isMedicalAdvice: true, memberId });
    const finalConfidence = selfConfidence !== 70 ? selfConfidence : guardrailResult.confidenceScore;

    // ── Update conversation history ────────────────────────────────────────
    conversation.push(
      { role: 'user', content: validation.sanitized || message },
      { role: 'assistant', content: guardrailResult.filteredResponse },
    );

    // ── Console logging ────────────────────────────────────────────────────
    consoleChatLog(memberId, message, guardrailResult.filteredResponse, finalConfidence, responseTimeMs);

    // ── Audit the response ─────────────────────────────────────────────────
    await writeAuditLog({
      action: 'chat_response',
      userId: memberId,
      resource: 'chat',
      details: {
        response_length: responseText.length,
        confidence_score: finalConfidence,
        response_time_ms: responseTimeMs,
        disclaimers_added: guardrailResult.addedDisclaimers.length,
        pii_redactions: guardrailResult.redactionCount,
        guardrail_triggered: !guardrailResult.safe,
      },
      ipAddress: ip,
      correlationId,
    });

    return NextResponse.json({
      success: true,
      correlationId,
      response: guardrailResult.filteredResponse,
      memberContext: {
        riskScore: member.risk_score,
        activeConditions: member.conditions.slice(0, 3),
        recentClaimsCount: memberClaims.length,
      },
      metadata: {
        confidenceScore: finalConfidence,
        disclaimers: guardrailResult.addedDisclaimers,
        conversationTurn: messages.length,
        sessionId: session,
        responseTimeMs,
      },
      warnings: validation.warnings,
    });

  } catch (error) {
    console.error('[Chat API] Error:', error);
    const isApiError = error instanceof Error && error.message.includes('API');
    return NextResponse.json(
      {
        error: isApiError
          ? 'AI service temporarily unavailable. Please try again in a moment.'
          : 'Connection failed. Please try again.',
        correlationId,
      },
      { status: 500 },
    );
  }
}
