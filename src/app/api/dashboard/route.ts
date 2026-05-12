import { NextRequest, NextResponse } from 'next/server';
import { MOCK_MEMBERS, MOCK_CLAIMS, MOCK_PREVENTIVE_CAMPAIGNS, getClaimsForMember } from '@/lib/mockData';
import { analyzePopulation } from '@/lib/claimsAnalysis';
import { scoreRisk } from '@/lib/riskScoring';
import { getInMemoryAuditLog } from '@/lib/auditLog';

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  // Population-wide analytics
  const populationInsights = analyzePopulation(MOCK_MEMBERS, MOCK_CLAIMS);

  // Risk distribution
  const riskDistribution = {
    critical: MOCK_MEMBERS.filter(m => m.risk_score >= 85).length,
    high:     MOCK_MEMBERS.filter(m => m.risk_score >= 65 && m.risk_score < 85).length,
    moderate: MOCK_MEMBERS.filter(m => m.risk_score >= 35 && m.risk_score < 65).length,
    low:      MOCK_MEMBERS.filter(m => m.risk_score < 35).length,
  };

  // Top 5 highest risk members with brief profiles
  const topRiskMembers = MOCK_MEMBERS
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, 5)
    .map(m => {
      const claims = getClaimsForMember(m.id);
      const risk = scoreRisk(m, claims);
      return {
        id: m.id,
        age: m.age,
        riskScore: m.risk_score,
        riskTier: risk.riskTier,
        conditions: m.conditions.slice(0, 3),
        predictedAnnualCost: risk.predictedAnnualCost,
        topRiskFactor: risk.riskFactors[0]?.name || 'N/A',
      };
    });

  // Campaign performance
  const campaignStats = {
    total: MOCK_PREVENTIVE_CAMPAIGNS.length,
    completed: MOCK_PREVENTIVE_CAMPAIGNS.filter(c => c.status === 'completed').length,
    engaged: MOCK_PREVENTIVE_CAMPAIGNS.filter(c => c.status === 'engaged').length,
    pending: MOCK_PREVENTIVE_CAMPAIGNS.filter(c => c.status === 'pending').length,
    totalProjectedSavings: MOCK_PREVENTIVE_CAMPAIGNS.reduce((s, c) => s + c.projected_savings, 0),
    completedSavings: MOCK_PREVENTIVE_CAMPAIGNS
      .filter(c => c.status === 'completed')
      .reduce((s, c) => s + c.projected_savings, 0),
  };

  // Recent audit activity
  const recentAuditLog = getInMemoryAuditLog(20);

  // Claims by month (last 8 months)
  const claimsByMonth = buildMonthlyTrend(MOCK_CLAIMS);

  // Cost category breakdown
  const costBreakdown = MOCK_CLAIMS.reduce<Record<string, number>>((acc, claim) => {
    acc[claim.category] = (acc[claim.category] || 0) + claim.cost;
    return acc;
  }, {});

  return NextResponse.json({
    success: true,
    overview: {
      totalMembers: MOCK_MEMBERS.length,
      totalClaimsCost: populationInsights.totalSpend,
      averageCostPerMember: populationInsights.averagePerMember,
      preventableEdVisits: populationInsights.preventableEdVisits,
      estimatedPreventableCost: populationInsights.estimatedPreventableCost,
      highRiskMemberCount: riskDistribution.critical + riskDistribution.high,
    },
    riskDistribution,
    topRiskMembers,
    populationInsights: {
      topCostDrivers: populationInsights.topCostDrivers,
      highCostMembers: populationInsights.highCostMembers,
    },
    campaignStats,
    claimsByMonth,
    costBreakdown,
    recentActivity: recentAuditLog.slice(0, 10).map(log => ({
      action: log.action,
      timestamp: log.timestamp,
      resource: log.resource,
    })),
  });
}

function buildMonthlyTrend(claims: typeof MOCK_CLAIMS) {
  const monthMap: Record<string, { cost: number; count: number; edCount: number }> = {};

  for (const claim of claims) {
    const month = claim.date.slice(0, 7); // YYYY-MM
    if (!monthMap[month]) monthMap[month] = { cost: 0, count: 0, edCount: 0 };
    monthMap[month].cost += claim.cost;
    monthMap[month].count++;
    if (claim.category === 'Emergency') monthMap[month].edCount++;
  }

  return Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([month, data]) => ({ month, ...data }));
}
