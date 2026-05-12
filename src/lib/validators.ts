import { z } from 'zod';

// ─── Validation Results ───────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized?: string;
}

// ─── Medical Symptom Terms ────────────────────────────────────────────────────

const MEDICAL_TERMS = [
  'pain', 'ache', 'hurt', 'sore', 'fever', 'cough', 'breath', 'chest', 'head',
  'stomach', 'abdomen', 'nausea', 'vomit', 'diarrhea', 'swelling', 'rash',
  'bleed', 'dizzy', 'fainting', 'fatigue', 'tired', 'weak', 'numbness', 'tingling',
  'pressure', 'tightness', 'shortness', 'wheezing', 'congestion', 'runny', 'sore throat',
  'ear', 'eye', 'vision', 'hearing', 'back', 'joint', 'muscle', 'cramp', 'spasm',
  'burning', 'itching', 'discharge', 'urination', 'constipation', 'appetite', 'weight',
  'sugar', 'glucose', 'blood pressure', 'heart', 'palpitation', 'irregular', 'edema',
  'infection', 'inflammation', 'medication', 'dose', 'side effect', 'reaction', 'allergy',
  'injury', 'fall', 'wound', 'bruise', 'cut', 'burn', 'fracture', 'sprain', 'strain',
  'anxiety', 'depression', 'mood', 'sleep', 'insomnia', 'confusion', 'memory',
  'seizure', 'tremor', 'balance', 'coordination', 'speech', 'swallowing',
  'diabetes', 'hypertension', 'asthma', 'copd', 'heart failure', 'kidney',
  'cancer', 'surgery', 'procedure', 'test', 'result', 'diagnosis', 'treatment',
  'mg', 'ml', 'temperature', 'bpm', 'mmhg', 'o2', 'sat', 'pulse', 'breath',
];

// ─── Injection & Jailbreak Patterns ──────────────────────────────────────────

const INJECTION_PATTERNS = [
  // Prompt injection
  /ignore (previous|prior|all|above|system) (instructions?|prompt|context)/i,
  /forget (everything|all|previous|your)/i,
  /you are now (a|an|the|no longer)/i,
  /pretend (you are|to be|that you)/i,
  /act as (if|a|an|though)/i,
  /jailbreak/i,
  /DAN (mode|prompt)/i,
  /developer mode/i,
  /override (safety|guardrails|restrictions|instructions)/i,
  /bypass (safety|filter|restriction|moderation)/i,
  /disable (safety|guardrails|filter)/i,
  /repeat after me/i,
  /say "(.*)" without/i,
  /respond only in/i,
  /do not (add|include|use|apply) (disclaimer|warning|safety)/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<\|.*\|>/,
  /### (System|Human|Assistant):/,
  /role[-\s]?play/i,
  /roleplay/i,
  /simulate (being|a|an)/i,
];

// ─── PII Patterns ─────────────────────────────────────────────────────────────

const PII_PATTERNS = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/, name: 'SSN' },
  { pattern: /\b\d{9}\b/, name: 'potential SSN' },
  { pattern: /\b4[0-9]{12}(?:[0-9]{3})?\b/, name: 'Visa card number' },
  { pattern: /\b5[1-5][0-9]{14}\b/, name: 'Mastercard number' },
  { pattern: /\b3[47][0-9]{13}\b/, name: 'Amex number' },
  { pattern: /\b[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/, name: 'card number pattern' },
  { pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/, name: 'phone number' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, name: 'email address' },
  { pattern: /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b.*\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b.*ssn|dob|date of birth/i, name: 'date of birth + SSN combo' },
];

// ─── Unsafe Healthcare Request Patterns ───────────────────────────────────────

const UNSAFE_MEDICAL_PATTERNS = [
  { pattern: /prescribe me|write me a prescription|i need a prescription for/i, type: 'prescription_request' },
  { pattern: /what (is|are) my (diagnosis|diagnos)/i, type: 'diagnosis_request' },
  { pattern: /diagnose me with/i, type: 'diagnosis_request' },
  { pattern: /tell me (if|whether) i have (cancer|diabetes|heart|hiv)/i, type: 'diagnosis_request' },
  { pattern: /should i (stop|discontinue|quit) (taking|my) (medication|drug|pill|med)/i, type: 'medication_change' },
  { pattern: /how (much|many) (medication|pills?|tablets?|mg) should i take/i, type: 'dosing_advice' },
  { pattern: /lethal dose|maximum dose of|fatal amount of/i, type: 'lethal_dosing' },
  { pattern: /overdose on|take too much/i, type: 'overdose_inquiry' },
  { pattern: /harm myself|hurt myself|suicide|kill myself/i, type: 'self_harm' },
];

// ─── SQL Injection Patterns ───────────────────────────────────────────────────

const SQL_INJECTION_PATTERNS = [
  /(\bOR\b|\bAND\b)\s+[\w'"]+\s*=\s*[\w'"]+/i,
  /'\s*(OR|AND)\s*'?[\w]+\s*=\s*'?[\w]+/i,
  /UNION\s+(ALL\s+)?SELECT/i,
  /INSERT\s+INTO/i,
  /UPDATE\s+\w+\s+SET/i,
  /DELETE\s+FROM/i,
  /DROP\s+(TABLE|DATABASE|COLUMN)/i,
  /EXEC(\s*\(|\s+)/i,
  /xp_cmdshell/i,
  /--\s*(comment|hack|inject)/i,
  /;\s*(DROP|INSERT|DELETE|UPDATE|SELECT)\s/i,
];

// ─── Validators ───────────────────────────────────────────────────────────────

export function validateSymptomInput(input: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== 'string') {
    return { valid: false, errors: ['Input must be a non-empty string'], warnings: [] };
  }

  // Length bounds
  if (input.length < 10) {
    errors.push('Please provide more detail about your symptoms (minimum 10 characters)');
  }
  if (input.length > 2000) {
    errors.push('Input too long. Please keep your description under 2,000 characters');
  }

  // Check for medical terms — must contain at least one
  const lowerInput = input.toLowerCase();
  const hasMedicalTerm = MEDICAL_TERMS.some(term => lowerInput.includes(term.toLowerCase()));
  if (!hasMedicalTerm && input.length > 10) {
    errors.push('Please describe your medical symptoms or health concern');
  }

  // Check for nonsense/random characters
  const alphaRatio = (input.match(/[a-zA-Z]/g) || []).length / input.length;
  if (alphaRatio < 0.4) {
    errors.push('Input does not appear to contain valid symptom description');
  }

  const sanitized = sanitizeInput(input);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitized,
  };
}

export function detectPromptInjection(input: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      errors.push('Input contains patterns that are not allowed in this healthcare context');
      break;
    }
  }

  // Check for excessive special characters that may indicate injection attempts
  const specialCharRatio = (input.match(/[<>{}\[\]\\|`~^]/g) || []).length / input.length;
  if (specialCharRatio > 0.1) {
    warnings.push('Input contains unusual formatting characters');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function detectPII(input: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const { pattern, name } of PII_PATTERNS) {
    if (pattern.test(input)) {
      // Don't log the actual PII, just flag it
      errors.push(`Your message appears to contain sensitive personal information (${name}). Please do not include personal identifiers in your health questions.`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function detectUnsafeHealthcareRequest(input: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const { pattern, type } of UNSAFE_MEDICAL_PATTERNS) {
    if (pattern.test(input)) {
      if (type === 'self_harm') {
        errors.push('If you are having thoughts of harming yourself, please call or text 988 (Suicide & Crisis Lifeline) immediately, or go to your nearest emergency room.');
      } else if (type === 'prescription_request') {
        errors.push('I cannot provide prescriptions. Please contact your provider or use telehealth for prescription needs.');
      } else if (type === 'diagnosis_request') {
        warnings.push('I cannot provide medical diagnoses. I can help you understand your symptoms and recommend the right level of care to get evaluated.');
      } else if (type === 'lethal_dosing' || type === 'overdose_inquiry') {
        errors.push('I cannot provide information about medication overdoses. If this is an emergency, call 911 or Poison Control (1-800-222-1222).');
      } else if (type === 'medication_change') {
        warnings.push('Do not change or stop medications without consulting your prescribing provider. I can help you understand your options.');
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function detectSQLInjection(input: string): ValidationResult {
  const errors: string[] = [];

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      errors.push('Input contains patterns that are not allowed');
      break;
    }
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

export function validateChatMessage(message: string): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  if (!message || typeof message !== 'string') {
    return { valid: false, errors: ['Message cannot be empty'], warnings: [] };
  }

  if (message.length > 3000) {
    return { valid: false, errors: ['Message too long (max 3,000 characters)'], warnings: [] };
  }

  const injectionCheck = detectPromptInjection(message);
  allErrors.push(...injectionCheck.errors);
  allWarnings.push(...injectionCheck.warnings);

  const piiCheck = detectPII(message);
  allErrors.push(...piiCheck.errors);
  allWarnings.push(...piiCheck.warnings);

  const sqlCheck = detectSQLInjection(message);
  allErrors.push(...sqlCheck.errors);

  const unsafeCheck = detectUnsafeHealthcareRequest(message);
  allErrors.push(...unsafeCheck.errors);
  allWarnings.push(...unsafeCheck.warnings);

  const sanitized = sanitizeInput(message);

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    sanitized,
  };
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

export const triageRequestSchema = z.object({
  memberId: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  symptoms: z.string().min(10).max(2000),
});

export const chatRequestSchema = z.object({
  memberId: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  message: z.string().min(1).max(3000),
  sessionId: z.string().optional(),
});

export const preventiveRequestSchema = z.object({
  memberId: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
});

// ─── Sanitizer ────────────────────────────────────────────────────────────────

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, 3000);
}

export function redactPIIForLogs(text: string): string {
  let redacted = text;
  for (const { pattern } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}
