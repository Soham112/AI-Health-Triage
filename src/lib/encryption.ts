// Field-level encryption for HIPAA-sensitive data
// Uses AES-256-GCM (authenticated encryption) via Web Crypto API

const ENCRYPTION_KEY_ENV = process.env.FIELD_ENCRYPTION_KEY;
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

// ─── Key Management ───────────────────────────────────────────────────────────

let _encryptionKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey> {
  if (_encryptionKey) return _encryptionKey;

  if (!ENCRYPTION_KEY_ENV) {
    // In dev/demo mode, derive a deterministic key from a constant
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('arlo-health-demo-key-do-not-use-in-prod'),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    _encryptionKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: new TextEncoder().encode('arlo-salt'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt'],
    );
    return _encryptionKey;
  }

  const keyBytes = Buffer.from(ENCRYPTION_KEY_ENV, 'base64');
  if (keyBytes.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes (256-bit), base64-encoded');
  }

  _encryptionKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
  return _encryptionKey;
}

// ─── Encryption / Decryption ─────────────────────────────────────────────────

export async function encryptField(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );

  // Concatenate IV + ciphertext, encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return Buffer.from(combined).toString('base64');
}

export async function decryptField(encrypted: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Buffer.from(encrypted, 'base64');

  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

// ─── Selective Field Encryption ───────────────────────────────────────────────
// Encrypts only PHI fields, leaving non-sensitive fields in plaintext
// for querying (risk_score, plan_type, etc.)

export interface EncryptedMemberFields {
  conditions_encrypted?: string;
  medications_encrypted?: string;
}

export async function encryptMemberPHI(data: {
  conditions?: string[];
  medications?: string[];
}): Promise<EncryptedMemberFields> {
  const result: EncryptedMemberFields = {};

  if (data.conditions !== undefined) {
    result.conditions_encrypted = await encryptField(JSON.stringify(data.conditions));
  }
  if (data.medications !== undefined) {
    result.medications_encrypted = await encryptField(JSON.stringify(data.medications));
  }

  return result;
}

export async function decryptMemberPHI(encrypted: EncryptedMemberFields): Promise<{
  conditions?: string[];
  medications?: string[];
}> {
  const result: { conditions?: string[]; medications?: string[] } = {};

  if (encrypted.conditions_encrypted) {
    result.conditions = JSON.parse(await decryptField(encrypted.conditions_encrypted));
  }
  if (encrypted.medications_encrypted) {
    result.medications = JSON.parse(await decryptField(encrypted.medications_encrypted));
  }

  return result;
}

// ─── HIPAA Safe Hash (for linking records without exposing PII) ───────────────

export async function hashIdentifier(identifier: string): Promise<string> {
  const salt = process.env.HASH_SALT || 'arlo-default-hash-salt';
  const data = new TextEncoder().encode(salt + identifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hash).toString('hex');
}

// ─── Token Generation (for session / audit correlation) ──────────────────────

export function generateSecureToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Buffer.from(bytes).toString('hex');
}
