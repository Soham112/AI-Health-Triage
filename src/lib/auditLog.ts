import { getServiceClient } from './supabase';
import { redactForAuditLog } from './guardrails';
import { generateSecureToken } from './encryption';

export type AuditAction =
  | 'triage_request'
  | 'triage_response'
  | 'chat_message'
  | 'chat_response'
  | 'preventive_analysis'
  | 'member_data_access'
  | 'admin_dashboard_access'
  | 'rate_limit_exceeded'
  | 'validation_failure'
  | 'injection_attempt_blocked'
  | 'pii_detected'
  | 'guardrail_triggered'
  | 'campaign_created'
  | 'campaign_updated';

export interface AuditEntry {
  action: AuditAction;
  userId: string;
  resource: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  correlationId?: string;
}

// ─── In-memory audit buffer (for demo without Supabase) ──────────────────────

const IN_MEMORY_AUDIT_LOG: Array<{
  id: string;
  action: string;
  user_id: string;
  resource: string;
  timestamp: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  correlation_id: string;
}> = [];

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const timestamp = new Date().toISOString();
  const correlationId = entry.correlationId || generateSecureToken(16);

  // Redact any PII from details before persisting
  const safeDetails = redactForAuditLog({
    ...entry.details,
    correlation_id: correlationId,
    timestamp,
  });

  const logEntry = {
    id: generateSecureToken(16),
    action: entry.action,
    user_id: entry.userId,
    resource: entry.resource,
    timestamp,
    details: safeDetails,
    ip_address: entry.ipAddress || null,
    correlation_id: correlationId,
  };

  // Always write to in-memory buffer (for demo/development)
  IN_MEMORY_AUDIT_LOG.push(logEntry);

  // Attempt Supabase write — fail gracefully if not configured
  try {
    const client = getServiceClient();
    const { error } = await client.from('audit_logs').insert({
      id: logEntry.id,
      action: logEntry.action,
      user_id: logEntry.user_id,
      resource: logEntry.resource,
      timestamp: logEntry.timestamp,
      details: logEntry.details,
      ip_address: logEntry.ip_address,
    });

    if (error) {
      // Log to stderr — never swallow audit failures silently
      console.error('[AUDIT] Failed to write to Supabase:', error.message);
    }
  } catch {
    // Supabase not configured — in-memory buffer is the fallback
    console.debug('[AUDIT] Supabase unavailable, using in-memory audit log');
  }
}

export function getInMemoryAuditLog(limit = 100): typeof IN_MEMORY_AUDIT_LOG {
  return IN_MEMORY_AUDIT_LOG.slice(-limit).reverse();
}

export function getAuditLogForUser(userId: string, limit = 50): typeof IN_MEMORY_AUDIT_LOG {
  return IN_MEMORY_AUDIT_LOG
    .filter(e => e.user_id === userId)
    .slice(-limit)
    .reverse();
}

// ─── Convenience Wrappers ─────────────────────────────────────────────────────

export async function logTriageRequest(opts: {
  memberId: string;
  symptoms: string;
  ipAddress?: string;
  correlationId: string;
}): Promise<void> {
  await writeAuditLog({
    action: 'triage_request',
    userId: opts.memberId,
    resource: 'triage',
    details: {
      symptom_length: opts.symptoms.length,
      symptom_preview: opts.symptoms.slice(0, 50) + '...',
    },
    ipAddress: opts.ipAddress,
    correlationId: opts.correlationId,
  });
}

export async function logTriageResponse(opts: {
  memberId: string;
  recommendation: string;
  confidence: number;
  estimatedCost: number;
  ipAddress?: string;
  correlationId: string;
}): Promise<void> {
  await writeAuditLog({
    action: 'triage_response',
    userId: opts.memberId,
    resource: 'triage',
    details: {
      recommendation: opts.recommendation,
      confidence: opts.confidence,
      estimated_cost: opts.estimatedCost,
    },
    ipAddress: opts.ipAddress,
    correlationId: opts.correlationId,
  });
}

export async function logChatMessage(opts: {
  memberId: string;
  messageLength: number;
  ipAddress?: string;
  correlationId: string;
}): Promise<void> {
  await writeAuditLog({
    action: 'chat_message',
    userId: opts.memberId,
    resource: 'chat',
    details: {
      message_length: opts.messageLength,
    },
    ipAddress: opts.ipAddress,
    correlationId: opts.correlationId,
  });
}

export async function logValidationFailure(opts: {
  userId: string;
  reason: string;
  action: AuditAction;
  ipAddress?: string;
}): Promise<void> {
  await writeAuditLog({
    action: opts.action,
    userId: opts.userId,
    resource: 'validation',
    details: { reason: opts.reason },
    ipAddress: opts.ipAddress,
  });
}

export async function logMemberDataAccess(opts: {
  accessedBy: string;
  memberId: string;
  fieldsAccessed: string[];
  ipAddress?: string;
}): Promise<void> {
  await writeAuditLog({
    action: 'member_data_access',
    userId: opts.accessedBy,
    resource: `member:${opts.memberId}`,
    details: { fields_accessed: opts.fieldsAccessed },
    ipAddress: opts.ipAddress,
  });
}
