import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { detectPromptInjection } from '@/lib/validators';
import { applyOutputGuardrails } from '@/lib/guardrails';
import { writeAuditLog, logValidationFailure } from '@/lib/auditLog';
import { checkRateLimit } from '@/lib/rateLimiter';
import { getMemberById, getClaimsForMember, getTriageHistoryForMember, getCampaignsForMember } from '@/lib/mockData';
import { analyzeMemberClaims } from '@/lib/claimsAnalysis';
import { scoreRisk } from '@/lib/riskScoring';
import { generateSecureToken } from '@/lib/encryption';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const correlationId = generateSecureToken(16);
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  try {
    const body = await request.json();
    const { memberId } = body;

    if (!memberId || typeof memberId !== 'string') {
      return NextResponse.json({ error: 'memberId is required' }, { status: 400 });
    }

    // Validate memberId format to prevent injection
    if (!/^[a-zA-Z0-9_-]+$/.test(memberId)) {
      return NextResponse.json({ error: 'Invalid memberId format' }, { status: 400 });
    }

    // ── Rate limiting ──────────────────────────────────────────────────────
    const limit = checkRateLimit(`preventive:member:${memberId}`, 10, 3600);
    if (!limit.allowed) {
      await logValidationFailure({ userId: memberId, reason: 'rate_limit_exceeded', action: 'rate_limit_exceeded', ipAddress: ip });
      return NextResponse.json({ error: 'Rate limit exceeded', retryAfterSeconds: limit.retryAfterSeconds }, { status: 429 });
    }

    // ── Member context ─────────────────────────────────────────────────────
    const member = getMemberById(memberId);
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const claims = getClaimsForMember(memberId);
    const triageHistory = getTriageHistoryForMember(memberId);
    const existingCampaigns = getCampaignsForMember(memberId);

    // ── Run intelligence analysis ──────────────────────────────────────────
    const claimsAnalysis = analyzeMemberClaims(member, claims);
    const riskScore = scoreRisk(member, claims);

    await writeAuditLog({
      action: 'preventive_analysis',
      userId: memberId,
      resource: `member:${memberId}`,
      details: {
        risk_tier: riskScore.riskTier,
        overall_risk: riskScore.overallRisk,
        claims_count: claims.length,
        existing_campaigns: existingCampaigns.length,
      },
      ipAddress: ip,
      correlationId,
    });

    // ── Build analysis context for Claude ─────────────────────────────────
    const claimsSummary = claims.slice(-10).map(c =>
      `  - ${c.date}: [${c.category}] ${c.diagnosis_code} via ${c.provider_type} — $${c.cost}`
    ).join('\n') || '  No claims history';

    const existingCampaignsSummary = existingCampaigns.map(c =>
      `  - ${c.campaign_type} (${c.status}) — projected savings: $${c.projected_savings.toLocaleString()}`
    ).join('\n') || '  No existing campaigns';

    const riskFactorsSummary = riskScore.riskFactors.slice(0, 5).map(f =>
      `  - ${f.name}: weight ${f.weight} (${f.category})`
    ).join('\n');

    const patternsSummary = claimsAnalysis.patterns.map(p =>
      `  - PATTERN: ${p.pattern}\n    Detail: ${p.description}\n    Recommendation: ${p.recommendation}`
    ).join('\n') || '  No significant patterns detected';

    const missingScreenings = claimsAnalysis.missingScreenings.join(', ') || 'None identified';
    const riskFlags = claimsAnalysis.riskFlags.join('\n  ') || 'None';

    const systemPrompt = `You are Arlo's preventive care intelligence engine. Your job is to analyze a member's claims data, conditions, and risk profile to generate targeted, high-impact preventive care campaigns.

Focus on interventions that:
1. Are evidence-based and clinically appropriate for this specific member
2. Have the highest projected ROI (cost savings vs intervention cost)
3. Address the most serious risk factors first
4. Are actionable now (not just general wellness advice)

MEMBER PROFILE:
- Age: ${member.age} | Gender: ${member.gender} | Plan: ${member.plan_type}
- Risk Score: ${riskScore.overallRisk}/100 (Tier: ${riskScore.riskTier.toUpperCase()})
- Conditions: ${member.conditions.join(', ') || 'None'}
- Medications: ${member.medications.join(', ') || 'None'}
- Predicted Annual Cost: $${riskScore.predictedAnnualCost.toLocaleString()}
- Hospitalization Probability (12mo): ${Math.round(riskScore.hospitalizationProbability * 100)}%

RISK FACTORS IDENTIFIED:
${riskFactorsSummary}

CLAIMS HISTORY (Last 10):
${claimsSummary}

CLAIMS PATTERNS FOUND:
${patternsSummary}

MISSING SCREENINGS:
${missingScreenings}

RISK FLAGS:
${riskFlags}

EXISTING CAMPAIGNS (Do not duplicate):
${existingCampaignsSummary}

Generate 3-5 targeted preventive campaigns. Respond in JSON:
{
  "campaigns": [
    {
      "title": "<specific campaign name>",
      "campaignType": "<type>",
      "clinicalRationale": "<2-3 sentences: why this member specifically needs this now>",
      "evidenceBase": "<specific guideline or study supporting this>",
      "projectedSavings": <number — realistic $ savings from preventing complications>,
      "projectedSavingsJustification": "<how you calculated this figure>",
      "timeframe": "<when to complete>",
      "priority": <1-5, 1=highest>,
      "urgency": "<high|medium|low>",
      "interventionSteps": ["<step 1>", "<step 2>", "<step 3>"],
      "successMetrics": ["<how will we measure success>"],
      "relatedConditions": ["<conditions this addresses>"]
    }
  ],
  "populationRiskSummary": "<overall assessment of this member's risk and why action is needed now>",
  "topPriorityRationale": "<why the #1 campaign is most urgent for this specific member>",
  "estimatedTotalSavings": <sum of projected savings>,
  "claimsPatternsFound": ["<key patterns from the data that drove these recommendations>"]
}`;

    if (!process.env.ANTHROPIC_API_KEY) {
      // Return intelligence-only response (no AI) when API not configured
      return NextResponse.json({
        success: true,
        correlationId,
        memberId,
        campaigns: riskScore.preventiveOpportunities.map((opp, i) => ({
          title: opp.intervention,
          clinicalRationale: opp.rationale,
          evidenceBase: opp.evidenceBase,
          projectedSavings: opp.projectedSavings,
          urgency: opp.urgency,
          priority: i + 1,
        })),
        riskAnalysis: {
          overallRisk: riskScore.overallRisk,
          riskTier: riskScore.riskTier,
          predictedAnnualCost: riskScore.predictedAnnualCost,
          hospitalizationProbability: riskScore.hospitalizationProbability,
          topRiskFactors: riskScore.riskFactors.slice(0, 5),
          riskDriverSummary: riskScore.riskDriverSummary,
        },
        claimsInsights: {
          totalCost: claimsAnalysis.totalCost,
          costByCategory: claimsAnalysis.costByCategory,
          patterns: claimsAnalysis.patterns,
          missingScreenings: claimsAnalysis.missingScreenings,
          riskFlags: claimsAnalysis.riskFlags,
        },
        source: 'rules_engine',
      });
    }

    // ── Claude analysis ────────────────────────────────────────────────────
    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Generate preventive care campaigns for member ${memberId} based on the clinical data provided.`,
      }],
    });

    const responseText = claudeResponse.content[0]?.type === 'text' ? claudeResponse.content[0].text : '';

    // ── Parse response ─────────────────────────────────────────────────────
    let aiCampaigns: Record<string, unknown> = {};
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      aiCampaigns = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      aiCampaigns = { campaigns: riskScore.preventiveOpportunities, claimsPatternsFound: claimsAnalysis.riskFlags };
    }

    // Apply guardrails to the population risk summary
    const summaryText = String(aiCampaigns.populationRiskSummary || '');
    const guardrailResult = applyOutputGuardrails(summaryText, { isMedicalAdvice: false, memberId });

    return NextResponse.json({
      success: true,
      correlationId,
      memberId,
      campaigns: aiCampaigns.campaigns || [],
      reasoning: {
        populationRiskSummary: guardrailResult.filteredResponse,
        topPriorityRationale: aiCampaigns.topPriorityRationale || '',
        claimsPatternsFound: aiCampaigns.claimsPatternsFound || claimsAnalysis.riskFlags,
        estimatedTotalSavings: aiCampaigns.estimatedTotalSavings || riskScore.preventiveOpportunities.reduce((s, o) => s + o.projectedSavings, 0),
      },
      riskAnalysis: {
        overallRisk: riskScore.overallRisk,
        riskTier: riskScore.riskTier,
        predictedAnnualCost: riskScore.predictedAnnualCost,
        hospitalizationProbability: riskScore.hospitalizationProbability,
        topRiskFactors: riskScore.riskFactors.slice(0, 5),
        riskDriverSummary: riskScore.riskDriverSummary,
      },
      claimsInsights: {
        totalCost: claimsAnalysis.totalCost,
        averageMonthlyCost: claimsAnalysis.averageMonthlyCost,
        costByCategory: claimsAnalysis.costByCategory,
        patterns: claimsAnalysis.patterns,
        missingScreenings: claimsAnalysis.missingScreenings,
        riskFlags: claimsAnalysis.riskFlags,
        adherenceGaps: claimsAnalysis.adherenceGaps,
      },
      existingCampaigns,
      source: 'ai_enhanced',
    });

  } catch (error) {
    console.error('[Preventive API] Error:', error);
    return NextResponse.json({ error: 'Internal server error', correlationId }, { status: 500 });
  }
}
