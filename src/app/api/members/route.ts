import { NextRequest, NextResponse } from 'next/server';
import { MOCK_MEMBERS, getClaimsForMember } from '@/lib/mockData';
import { scoreRisk } from '@/lib/riskScoring';
import { writeAuditLog } from '@/lib/auditLog';

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const { searchParams } = new URL(request.url);
  const riskFilter = searchParams.get('riskTier');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 50);

  await writeAuditLog({
    action: 'admin_dashboard_access',
    userId: 'admin',
    resource: 'members_list',
    details: { filter: riskFilter, limit },
    ipAddress: ip,
  });

  let members = MOCK_MEMBERS;
  if (riskFilter) {
    members = MOCK_MEMBERS.filter(m => {
      const tier = m.risk_score >= 85 ? 'critical' : m.risk_score >= 65 ? 'high' : m.risk_score >= 35 ? 'moderate' : 'low';
      return tier === riskFilter;
    });
  }

  const membersWithScores = members.slice(0, limit).map(member => {
    const claims = getClaimsForMember(member.id);
    const risk = scoreRisk(member, claims);
    return {
      id: member.id,
      age: member.age,
      gender: member.gender,
      conditions: member.conditions,
      riskScore: member.risk_score,
      riskTier: risk.riskTier,
      planType: member.plan_type,
      predictedAnnualCost: risk.predictedAnnualCost,
      hospitalizationProbability: risk.hospitalizationProbability,
      totalClaimsCost: claims.reduce((s, c) => s + c.cost, 0),
      claimsCount: claims.length,
      topRiskFactors: risk.riskFactors.slice(0, 3).map(f => f.name),
    };
  });

  // Sort by risk score descending
  membersWithScores.sort((a, b) => b.riskScore - a.riskScore);

  return NextResponse.json({
    success: true,
    members: membersWithScores,
    total: members.length,
    summary: {
      critical: MOCK_MEMBERS.filter(m => m.risk_score >= 85).length,
      high: MOCK_MEMBERS.filter(m => m.risk_score >= 65 && m.risk_score < 85).length,
      moderate: MOCK_MEMBERS.filter(m => m.risk_score >= 35 && m.risk_score < 65).length,
      low: MOCK_MEMBERS.filter(m => m.risk_score < 35).length,
    },
  });
}
