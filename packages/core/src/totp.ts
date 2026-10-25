import { createHmac, randomBytes } from 'node:crypto';

/** TOTP (RFC 6238) sobre HOTP (RFC 4226), HMAC-SHA1, 6 dígitos, passo de 30 s. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = 6, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export const TOTP_STEP = 30;

export function totpStep(timeMs = Date.now()): number {
  return Math.floor(timeMs / 1000 / TOTP_STEP);
}

export function totp(secretB32: string, timeMs = Date.now()): string {
  return hotp(base32Decode(secretB32), totpStep(timeMs));
}

/**
 * Valida um código TOTP com tolerância de ±1 passo.
 * Devolve o passo aceite (para impedir reutilização) ou null.
 */
export function verifyTotp(secretB32: string, code: string, timeMs = Date.now(), lastUsedStep?: number | null): number | null {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const secret = base32Decode(secretB32);
  const now = totpStep(timeMs);
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep != null && step <= lastUsedStep) continue;
    if (hotp(secret, step) === normalized) return step;
  }
  return null;
}

export function totpUri(secretB32: string, accountName: string, issuer = 'Somar'): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${TOTP_STEP}`;
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  });
}
