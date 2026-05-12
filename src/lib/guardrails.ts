// ─── Output Safety Guardrails ─────────────────────────────────────────────────

export interface GuardrailResult {
  safe: boolean;
  filteredResponse: string;
  addedDisclaimers: string[];
  redactionCount: number;
  confidenceScore: number;
  blockedReason?: string;
}

// Patterns that indicate the AI gave harmful advice that must be blocked
const HARMFUL_OUTPUT_PATTERNS = [
  { pattern: /you (definitely|certainly|clearly|definitely) have (cancer|diabetes|heart disease|COVID|HIV)/i, reason: 'definitive diagnosis' },
  { pattern: /I (diagnose|conclude) (you|this patient) (has|have|with)/i, reason: 'diagnosis assertion' },
  { pattern: /stop taking (your )?medication immediately/i, reason: 'unsafe medication advice' },
  { pattern: /take (\d+|more|double) (times |the )?(your )?(dose|dosage|pills?|tablets?)/i, reason: 'dosing instruction' },
  { pattern: /this (medication|drug) is safe to take (with|alongside)/i, reason: 'drug interaction claim without MD' },
  { pattern: /you do(n't| not) need to see a doctor/i, reason: 'discouraging care-seeking' },
  { pattern: /this (is|sounds like) (definitely|certainly) (just|only) (stress|anxiety)/i, reason: 'dismissive minimization' },
  { pattern: /home remedy (will|should|can) cure/i, reason: 'cure claim' },
  { pattern: /(\d+ mg|\d+ ml|\d+ units?|dose of \d+)/i, reason: 'specific dosing — requires MD', severity: 'warning' },
];

// Situations that require a disclaimer
const DISCLAIMER_TRIGGERS = [
  { pattern: /medication|drug|prescription|dose|dosage|mg|ml/i, disclaimer: 'Always take medications exactly as prescribed by your provider. Do not change doses without consulting them first.' },
  { pattern: /diagnos|diagnose|condition|disease|disorder/i, disclaimer: 'Only a licensed healthcare provider can diagnose medical conditions. This information is educational, not diagnostic.' },
  { pattern: /emergency|ER|911|urgent|ambulance/i, disclaimer: 'If you believe this is a life-threatening emergency, call 911 immediately.' },
  { pattern: /mental health|anxiety|depression|suicide|self-harm/i, disclaimer: 'For mental health crises, call or text 988 (Suicide & Crisis Lifeline) or text HOME to 741741 (Crisis Text Line).' },
  { pattern: /surgery|procedure|operation|biopsy/i, disclaimer: 'Decisions about medical procedures should be made in consultation with your care team.' },
  { pattern: /test result|lab result|biopsy result/i, disclaimer: 'Lab and test results should be interpreted by your healthcare provider in the context of your full medical history.' },
  { pattern: /pregnancy|pregnant|prenatal|fetal/i, disclaimer: 'Always consult your OB/GYN or midwife for guidance specific to your pregnancy.' },
];

// PII patterns to redact from AI output before logging
const OUTPUT_PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g,
];

// Quality signals that indicate a high-confidence, useful response
const QUALITY_SIGNALS = {
  positive: [
    /recommend (seeing|contacting|calling|visiting)/i,
    /based on (your|the) (symptoms|history|information)/i,
    /it('s| is) important (to|that)/i,
    /consult (your|a) (doctor|provider|physician|specialist)/i,
    /seek (medical|emergency|immediate|urgent) (care|attention|help)/i,
    /here are|consider the following|options include/i,
  ],
  negative: [
    /I('m| am) unable to/i,
    /I (cannot|can't) (help|answer|respond)/i,
    /I don't (have|know)/i,
  ],
};

export function applyOutputGuardrails(
  response: string,
  context: { isMedicalAdvice: boolean; memberId?: string },
): GuardrailResult {
  let filteredResponse = response;
  const addedDisclaimers: string[] = [];
  let redactionCount = 0;
  let blockedReason: string | undefined;

  // ── 1. Block harmful patterns ─────────────────────────────────────────────
  for (const { pattern, reason, severity } of HARMFUL_OUTPUT_PATTERNS) {
    if (pattern.test(filteredResponse)) {
      if (severity === 'warning') {
        // Soften but don't block
        addedDisclaimers.push('Specific medication dosages mentioned are for reference only — always follow your provider\'s prescription instructions.');
      } else {
        blockedReason = reason;
        filteredResponse = `I want to make sure I give you safe, appropriate guidance. ${getBlockedResponseReplacement(reason)}`;
        return {
          safe: false,
          filteredResponse,
          addedDisclaimers,
          redactionCount,
          confidenceScore: 0,
          blockedReason,
        };
      }
    }
  }

  // ── 2. Add contextual disclaimers ─────────────────────────────────────────
  const disclaimerSet = new Set<string>();
  for (const { pattern, disclaimer } of DISCLAIMER_TRIGGERS) {
    if (pattern.test(filteredResponse) && !disclaimerSet.has(disclaimer)) {
      disclaimerSet.add(disclaimer);
    }
  }

  if (context.isMedicalAdvice && !filteredResponse.toLowerCase().includes('consult') && !filteredResponse.toLowerCase().includes('provider')) {
    disclaimerSet.add('This information is for guidance only. Please consult your healthcare provider for personalized medical advice.');
  }

  addedDisclaimers.push(...disclaimerSet);

  // ── 3. Redact PII from output before logging ──────────────────────────────
  let logSafeResponse = filteredResponse;
  for (const pattern of OUTPUT_PII_PATTERNS) {
    const before = logSafeResponse;
    logSafeResponse = logSafeResponse.replace(pattern, '[REDACTED]');
    if (logSafeResponse !== before) redactionCount++;
  }

  // ── 4. Calculate confidence score ─────────────────────────────────────────
  const confidenceScore = calculateConfidence(filteredResponse);

  // ── 5. Append disclaimers to response ─────────────────────────────────────
  if (addedDisclaimers.length > 0) {
    filteredResponse = filteredResponse.trimEnd() + '\n\n---\n*' + addedDisclaimers.join(' ') + '*';
  }

  return {
    safe: true,
    filteredResponse,
    addedDisclaimers,
    redactionCount,
    confidenceScore,
  };
}

function calculateConfidence(response: string): number {
  let score = 70; // baseline

  // Positive quality signals increase confidence
  for (const pattern of QUALITY_SIGNALS.positive) {
    if (pattern.test(response)) score += 5;
  }

  // Negative signals decrease confidence
  for (const pattern of QUALITY_SIGNALS.negative) {
    if (pattern.test(response)) score -= 20;
  }

  // Length signals — very short responses are less confident
  if (response.length < 100) score -= 15;
  if (response.length > 300) score += 5;

  // Uncertainty language
  if (/may|might|could|possibly|potentially|often|sometimes/i.test(response)) score -= 5;
  if (/typically|generally|usually/i.test(response)) score += 3;

  return Math.max(0, Math.min(100, score));
}

function getBlockedResponseReplacement(reason: string): string {
  const replacements: Record<string, string> = {
    'definitive diagnosis': 'I can help you understand your symptoms and navigate the right care, but only a licensed provider can diagnose conditions. Please schedule an appointment with your doctor or use our triage tool to find the right level of care.',
    'diagnosis assertion': 'I\'m not able to provide diagnoses. Please work with your healthcare provider who can evaluate you fully.',
    'unsafe medication advice': 'Medication changes should always be discussed with your prescribing provider before making any adjustments. Please contact your care team.',
    'dosing instruction': 'Medication dosing must be determined by your prescribing provider based on your full medical history. Please contact your doctor or pharmacist.',
    'discouraging care-seeking': 'When in doubt, it\'s always appropriate to check in with your healthcare provider. Your health and peace of mind matter.',
    'dismissive minimization': 'Your symptoms deserve proper evaluation. I recommend connecting with a healthcare provider who can assess you in full context.',
    'cure claim': 'I want to make sure you get evidence-based guidance. Please consult your healthcare provider for treatment recommendations.',
  };
  return replacements[reason] || 'Please consult your healthcare provider for guidance on this question.';
}

export function redactForAuditLog(data: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...data };

  // Fields that should never appear in logs
  const sensitiveFields = ['ssn', 'credit_card', 'dob', 'date_of_birth', 'phone', 'address', 'email'];
  for (const field of sensitiveFields) {
    if (field in redacted) {
      redacted[field] = '[REDACTED]';
    }
  }

  // Redact PII from string values
  for (const [key, value] of Object.entries(redacted)) {
    if (typeof value === 'string') {
      let redactedValue = value;
      for (const pattern of OUTPUT_PII_PATTERNS) {
        redactedValue = redactedValue.replace(pattern, '[REDACTED]');
      }
      redacted[key] = redactedValue;
    }
  }

  return redacted;
}
