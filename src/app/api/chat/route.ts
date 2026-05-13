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

    const systemPrompt = `You are Arlo, a knowledgeable and empathetic healthcare AI assistant. You help health plan members navigate their health with personalized, evidence-based guidance.

MEMBER CONTEXT (USE THIS TO PERSONALIZE EVERY RESPONSE):
- Age: ${member.age} | Gender: ${member.gender} | Plan: ${member.plan_type}
- Active Conditions: ${member.conditions.length > 0 ? member.conditions.join(', ') : 'None documented'}
- Current Medications: ${member.medications.length > 0 ? member.medications.join(', ') : 'None documented'}
- Risk Score: ${member.risk_score}/100 (${member.risk_score >= 75 ? 'HIGH RISK — be especially attentive' : member.risk_score >= 50 ? 'moderate risk' : 'lower risk'})

RECENT CLAIMS HISTORY:
${topClaims}

RECENT TRIAGE SESSIONS:
${recentTriages}

PREVIOUS CONVERSATIONS:
${pastChats}

GUIDELINES:
1. Always personalize — reference their actual conditions and medications when relevant
2. Be warm but clinically accurate — don't be dismissive or overly alarming
3. Recognize patterns: if they've had recent ED visits or hospitalizations for this condition, acknowledge it
4. Guide to appropriate care, but do NOT diagnose
5. For high-risk members (score 75+), err on the side of caution — suggest clinical evaluation sooner
6. Mention their specific medications when relevant (e.g., "given you're on Metformin, this could affect...")
7. Keep responses focused and actionable — 3-5 sentences typically, more if complex
8. End with a clear next step when appropriate

ABSOLUTE LIMITS:
- Never prescribe or adjust medication doses
- Never provide definitive diagnoses
- Never say "you don't need to see a doctor"
- Always recommend emergency care for life-threatening symptoms

CONFIDENCE RATING: At the very end of your response, on its own line, write exactly: [CONFIDENCE: N] where N is 0-100 representing your certainty in this health guidance. Use higher scores for well-established guidance (e.g., 90+), moderate scores when the answer depends on factors you cannot assess (70-89), and lower scores when the topic is complex or highly individualized (50-69).`;

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
