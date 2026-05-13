import { detectPromptInjection, detectPII } from './validators';
import { applyOutputGuardrails } from './guardrails';

export interface InputValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

const NON_HEALTHCARE_PATTERNS = [
  /hack(ing)?\s+(into|my|the|a|an|your|their)\s+(account|system|database|server|record)/i,
  /\b(crack|exploit|brute[\s-]?force)\b.*(account|system|database|password)/i,
  /(steal|obtain|access)\s+(someone else'?s?|another person'?s?|unauthorized)\s+(data|records|account)/i,
  /\b(phishing|malware|ransomware)\b/i,
  /(wire|transfer|send)\s+(money|funds|bitcoin|crypto)\s+(to|from)/i,
  /\b(hack|ddos|sql\s?inject|xss|csrf)\b.*(hospital|clinic|ehr|emr|system)/i,
];

export function validateInput(message: string): InputValidationResult {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Please ask a health-related question.' };
  }

  if (message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty.' };
  }

  if (message.length > 1000) {
    return { valid: false, error: 'Message too long. Please keep questions under 1,000 characters.' };
  }

  const injectionCheck = detectPromptInjection(message);
  if (!injectionCheck.valid) {
    return { valid: false, error: 'Invalid input detected. Please ask a health-related question.' };
  }

  const piiCheck = detectPII(message);
  if (!piiCheck.valid) {
    return { valid: false, error: piiCheck.errors[0] };
  }

  for (const pattern of NON_HEALTHCARE_PATTERNS) {
    if (pattern.test(message)) {
      return { valid: false, error: 'I can only help with health and wellness questions.' };
    }
  }

  return { valid: true, warnings: [] };
}

export function filterResponse(response: string): string {
  const result = applyOutputGuardrails(response, { isMedicalAdvice: true });
  return result.filteredResponse;
}

// Extracts [CONFIDENCE: N] tag Claude embeds, or falls back to heuristic
export function generateConfidence(response: string): number {
  const tagMatch = response.match(/\[CONFIDENCE:\s*(\d+)\]/i);
  if (tagMatch) {
    const n = parseInt(tagMatch[1], 10);
    if (n >= 0 && n <= 100) return n;
  }
  const pctMatch = response.match(/(?:I(?:'m| am)|we(?:'re| are))\s+(\d+)%\s+confident/i);
  if (pctMatch) {
    const n = parseInt(pctMatch[1], 10);
    if (n >= 0 && n <= 100) return n;
  }
  return 70;
}

// Strips the [CONFIDENCE: N] tag from the response text
export function stripConfidenceTag(text: string): string {
  return text.replace(/\n?\[CONFIDENCE:\s*\d+\]\s*$/i, '').trimEnd();
}
