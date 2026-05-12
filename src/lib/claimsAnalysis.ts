import type { MemberRow, ClaimRow } from './supabase';

export interface ClaimsPattern {
  pattern: string;
  description: string;
  claimsCount: number;
  totalCost: number;
  actionable: boolean;
  recommendation: string;
}

export interface MemberClaimsAnalysis {
  memberId: string;
  totalCost: number;
  averageMonthlyCost: number;
  costByCategory: Record<string, number>;
  costDrivers: string[];
  patterns: ClaimsPattern[];
  missingScreenings: string[];
  adherenceGaps: string[];
  riskFlags: string[];
}

export interface PopulationClaimsInsights {
  totalSpend: number;
  averagePerMember: number;
  topCostDrivers: Array<{ category: string; totalCost: number; percentage: number }>;
  highCostMembers: Array<{ memberId: string; totalCost: number; conditions: string[] }>;
  preventableEdVisits: number;
  estimatedPreventableCost: number;
  populationRiskDistribution: Record<string, number>;
}

// CPT code groupings for screening detection
const SCREENING_CPT_CODES: Record<string, string[]> = {
  'HbA1c (diabetes monitoring)':    ['83036', '83037'],
  'Lipid panel':                     ['80061', '80071'],
  'Kidney function panel':           ['80047', '80053', '80069'],
  'Annual wellness visit':           ['G0438', 'G0439', '99385', '99386', '99387', '99395', '99396', '99397'],
  'Mammography':                     ['77067', '77065', '77066'],
  'Colorectal cancer screening':     ['45378', '45380', '82274', '81528'],
  'Cervical cancer screening':       ['88141', '88142', '87624'],
  'Diabetic eye exam':               ['92134', '92228', '92229'],
  'Bone density (DEXA)':             ['77080', '77085'],
  'Pulmonary function test':         ['94060', '94070', '94375'],
  'EKG':                             ['93000', '93010'],
  'Echocardiogram':                  ['93306', '93307', '93308'],
};

// Conditions that should have corresponding monitoring claims
const CONDITION_MONITORING_MAP: Record<string, string[]> = {
  'Type 2 Diabetes':         ['83036', '83037', '92134', '80047'],
  'Type 1 Diabetes':         ['83036', '83037', '92134', '80047'],
  'Hypertension':            ['99213', '99214', '93000'],
  'COPD':                    ['94060', '99213', '99214'],
  'CHF':                     ['93306', '93000', '99215'],
  'Coronary Artery Disease': ['93306', '93000', '80061'],
  'Atrial Fibrillation':     ['93000', '99215'],
  'Chronic Kidney Disease':  ['80069', '80047'],
  'Osteoporosis':            ['77080', '77085'],
};

export function analyzeMemberClaims(member: MemberRow, claims: ClaimRow[]): MemberClaimsAnalysis {
  const totalCost = claims.reduce((sum, c) => sum + c.cost, 0);

  // Cost by category
  const costByCategory: Record<string, number> = {};
  for (const claim of claims) {
    costByCategory[claim.category] = (costByCategory[claim.category] || 0) + claim.cost;
  }

  // Average monthly cost (based on span of claims)
  const dateRange = claims.length > 0 ? getDateRangeMonths(claims) : 1;
  const averageMonthlyCost = Math.round(totalCost / Math.max(dateRange, 1));

  // Cost drivers
  const costDrivers = Object.entries(costByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat, cost]) => `${cat}: $${cost.toLocaleString()}`);

  // Patterns
  const patterns = detectClaimsPatterns(member, claims);

  // Missing screenings based on conditions
  const missingScreenings = detectMissingScreenings(member, claims);

  // Adherence gaps (no follow-up after high-cost events)
  const adherenceGaps = detectAdherenceGaps(claims);

  // Risk flags from claims
  const riskFlags = detectRiskFlags(claims, member);

  return {
    memberId: member.id,
    totalCost,
    averageMonthlyCost,
    costByCategory,
    costDrivers,
    patterns,
    missingScreenings,
    adherenceGaps,
    riskFlags,
  };
}

function detectClaimsPatterns(member: MemberRow, claims: ClaimRow[]): ClaimsPattern[] {
  const patterns: ClaimsPattern[] = [];
  const procedures = claims.map(c => c.procedure_code);
  const diagnosisCodes = new Set(claims.map(c => c.diagnosis_code));

  // Repeated ED visits for same diagnosis
  const edClaims = claims.filter(c => c.category === 'Emergency');
  const diagnosisEdCounts: Record<string, number> = {};
  for (const claim of edClaims) {
    diagnosisEdCounts[claim.diagnosis_code] = (diagnosisEdCounts[claim.diagnosis_code] || 0) + 1;
  }
  for (const [dx, count] of Object.entries(diagnosisEdCounts)) {
    if (count >= 2) {
      const edCost = edClaims.filter(c => c.diagnosis_code === dx).reduce((s, c) => s + c.cost, 0);
      patterns.push({
        pattern: 'Repeated ED visits — same diagnosis',
        description: `${count} ED visits for diagnosis ${dx} — signals uncontrolled condition or care gap`,
        claimsCount: count,
        totalCost: edCost,
        actionable: true,
        recommendation: 'Enroll in disease management program; establish urgent care pathway for acute episodes',
      });
    }
  }

  // Hospitalization without follow-up
  const inpatientClaims = claims.filter(c => c.category === 'Inpatient');
  for (const hosp of inpatientClaims) {
    const hospDate = new Date(hosp.date);
    const followUpWindow = new Date(hospDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const followUpVisit = claims.find(c =>
      c.member_id === hosp.member_id &&
      ['Office Visit', 'Preventive'].includes(c.category) &&
      new Date(c.date) > hospDate &&
      new Date(c.date) <= followUpWindow
    );
    if (!followUpVisit) {
      patterns.push({
        pattern: 'No 30-day post-discharge follow-up',
        description: `Hospitalization on ${hosp.date} without documented follow-up visit — readmission risk elevated`,
        claimsCount: 1,
        totalCost: hosp.cost,
        actionable: true,
        recommendation: 'Schedule 7-day and 30-day post-discharge calls; coordinate PCP follow-up appointment',
      });
    }
  }

  // High pharmacy costs (proxy: complex meds)
  const complexMedCount = member.medications.filter(m =>
    ['Insulin', 'Adalimumab', 'Infliximab', 'Etanercept', 'Leuprolide', 'Apixaban', 'Rivaroxaban'].some(p => m.includes(p))
  ).length;
  if (complexMedCount >= 2) {
    patterns.push({
      pattern: 'High-cost specialty medications',
      description: `${complexMedCount} specialty/biologic medications — potential for step therapy or adherence optimization`,
      claimsCount: complexMedCount,
      totalCost: complexMedCount * 2400,
      actionable: true,
      recommendation: 'Review for specialty pharmacy preferred-channel savings; assess adherence compliance',
    });
  }

  // Diagnostic clustering — multiple expensive diagnostics in short window
  const diagnostics = claims.filter(c => c.category === 'Diagnostic');
  if (diagnostics.length >= 3) {
    const diagCost = diagnostics.reduce((s, c) => s + c.cost, 0);
    patterns.push({
      pattern: 'High diagnostic utilization',
      description: `${diagnostics.length} diagnostic procedures — may indicate complex workup or duplicative testing`,
      claimsCount: diagnostics.length,
      totalCost: diagCost,
      actionable: false,
      recommendation: 'Review for duplicate imaging; consider care coordinator to streamline specialist workups',
    });
  }

  return patterns;
}

function detectMissingScreenings(member: MemberRow, claims: ClaimRow[]): string[] {
  const missing: string[] = [];
  const existingProcedures = new Set(claims.map(c => c.procedure_code));

  // Condition-specific monitoring gaps
  for (const condition of member.conditions) {
    for (const [condName, requiredCodes] of Object.entries(CONDITION_MONITORING_MAP)) {
      if (condition.includes(condName)) {
        const hasAny = requiredCodes.some(code => existingProcedures.has(code));
        if (!hasAny) {
          missing.push(`${condName} monitoring (no relevant claims found)`);
        }
        break;
      }
    }
  }

  // Age/gender-based preventive gaps
  if (member.age >= 45) {
    const hasColorectal = ['45378', '45380', '82274'].some(c => existingProcedures.has(c));
    if (!hasColorectal) missing.push('Colorectal cancer screening (age 45+)');
  }

  if (member.age >= 50 && member.gender === 'F') {
    const hasMammo = ['77067', '77065', '77066'].some(c => existingProcedures.has(c));
    if (!hasMammo) missing.push('Mammography (women 40+)');
  }

  if (member.age >= 65) {
    const hasWellness = ['G0438', 'G0439', '99395', '99396', '99397'].some(c => existingProcedures.has(c));
    if (!hasWellness) missing.push('Annual wellness visit');
  }

  if (member.conditions.some(c => c.includes('Osteoporosis')) || (member.age >= 65 && member.gender === 'F')) {
    const hasDEXA = ['77080', '77085'].some(c => existingProcedures.has(c));
    if (!hasDEXA) missing.push('Bone density scan (DEXA)');
  }

  return missing;
}

function detectAdherenceGaps(claims: ClaimRow[]): string[] {
  const gaps: string[] = [];

  // Office visit frequency for chronic conditions (should be quarterly for high-risk)
  const officeVisits = claims.filter(c => c.category === 'Office Visit');
  const months = getDateRangeMonths(claims);
  const visitFrequency = months > 0 ? officeVisits.length / months : 0;

  if (claims.length > 0 && visitFrequency < 0.5 && officeVisits.length < 2) {
    gaps.push('Low ambulatory visit frequency — may indicate care avoidance or access barriers');
  }

  // Lab monitoring gaps
  const labClaims = claims.filter(c => c.category === 'Lab');
  if (claims.length > 3 && labClaims.length === 0) {
    gaps.push('No laboratory monitoring in claims history — possible medication adherence or monitoring gap');
  }

  return gaps;
}

function detectRiskFlags(claims: ClaimRow[], member: MemberRow): string[] {
  const flags: string[] = [];

  const edVisits = claims.filter(c => c.category === 'Emergency').length;
  const inpatientStays = claims.filter(c => c.category === 'Inpatient').length;

  if (edVisits >= 3) flags.push(`HIGH: ${edVisits} ED visits — frequent acute decompensation pattern`);
  else if (edVisits >= 2) flags.push(`MODERATE: ${edVisits} ED visits — disease instability`);

  if (inpatientStays >= 2) flags.push(`HIGH: ${inpatientStays} hospitalizations — readmission pattern detected`);
  else if (inpatientStays === 1) flags.push(`MODERATE: Recent hospitalization — 30-day readmission risk elevated`);

  const totalCost = claims.reduce((sum, c) => sum + c.cost, 0);
  if (totalCost > 50000) flags.push(`HIGH: $${Math.round(totalCost / 1000)}K annual spend — top 5% cost tier`);

  if (member.age >= 75 && member.conditions.length >= 3) {
    flags.push('HIGH: Frailty risk — advanced age + multiple comorbidities + polypharmacy');
  }

  return flags;
}

function getDateRangeMonths(claims: ClaimRow[]): number {
  if (claims.length < 2) return 1;
  const dates = claims.map(c => new Date(c.date).getTime());
  const rangeMs = Math.max(...dates) - Math.min(...dates);
  return Math.max(1, Math.round(rangeMs / (1000 * 60 * 60 * 24 * 30)));
}

export function analyzePopulation(
  members: MemberRow[],
  allClaims: ClaimRow[],
): PopulationClaimsInsights {
  const totalSpend = allClaims.reduce((sum, c) => sum + c.cost, 0);
  const averagePerMember = members.length > 0 ? Math.round(totalSpend / members.length) : 0;

  // Cost by category
  const costByCategory: Record<string, number> = {};
  for (const claim of allClaims) {
    costByCategory[claim.category] = (costByCategory[claim.category] || 0) + claim.cost;
  }
  const topCostDrivers = Object.entries(costByCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, cost]) => ({
      category,
      totalCost: cost,
      percentage: Math.round((cost / totalSpend) * 100),
    }));

  // High-cost members
  const memberSpend: Record<string, number> = {};
  for (const claim of allClaims) {
    memberSpend[claim.member_id] = (memberSpend[claim.member_id] || 0) + claim.cost;
  }
  const highCostMembers = Object.entries(memberSpend)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([memberId, cost]) => ({
      memberId,
      totalCost: cost,
      conditions: members.find(m => m.id === memberId)?.conditions || [],
    }));

  // Preventable ED visits (ED visits for conditions manageable in outpatient setting)
  const preventableEdVisits = allClaims.filter(c =>
    c.category === 'Emergency' &&
    ['E11', 'J44', 'I50', 'J18', 'N18'].some(prefix => c.diagnosis_code.startsWith(prefix))
  ).length;
  const estimatedPreventableCost = preventableEdVisits * 1800;

  // Risk distribution
  const populationRiskDistribution: Record<string, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const member of members) {
    const tier = member.risk_score >= 85 ? 'critical' : member.risk_score >= 65 ? 'high' : member.risk_score >= 35 ? 'moderate' : 'low';
    populationRiskDistribution[tier]++;
  }

  return {
    totalSpend,
    averagePerMember,
    topCostDrivers,
    highCostMembers,
    preventableEdVisits,
    estimatedPreventableCost,
    populationRiskDistribution,
  };
}
