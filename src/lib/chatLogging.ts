export function logChatMessage(
  userId: string,
  message: string,
  response: string,
  confidence: number,
  responseTimeMs?: number,
): void {
  const preview = message.length > 80 ? message.slice(0, 80) + '...' : message;
  console.log(`[CHAT] User: '${preview}'`);
  console.log(`[CHAT] Member: ${userId}`);
  console.log(`[CHAT] AI confidence: ${confidence}%`);
  console.log(`[CHAT] Response length: ${response.length} chars`);
  if (responseTimeMs !== undefined) {
    console.log(`[CHAT] Response time: ${responseTimeMs}ms`);
  }
}

export function logChatError(userId: string, error: string): void {
  console.error(`[CHAT] Error for ${userId}: ${error}`);
}

export function logRateLimit(userId: string, ip: string): void {
  console.warn(`[CHAT] Rate limit hit — member: ${userId}, ip: ${ip}`);
}

export function logSafetyBlock(userId: string, reason: string): void {
  console.warn(`[CHAT] Safety block for ${userId}: ${reason}`);
}
