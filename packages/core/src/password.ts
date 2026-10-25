import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

// Parâmetros scrypt (recomendação OWASP: N=2^17, r=8, p=1; usamos 2^15 por limitações de memória no VPS).
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

export const PASSWORD_MIN_LENGTH = 10;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `A palavra-passe tem de ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > 200) return 'A palavra-passe é demasiado longa.';
  if (!/[a-zA-Z]/.test(password) || !/[0-9\W_]/.test(password))
    return 'Usa letras e pelo menos um número ou símbolo.';
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const nN = Number(n);
  const nR = Number(r);
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, {
    N: nN,
    r: nR,
    p: Number(p),
    maxmem: 128 * nN * nR * 2,
  });
  return timingSafeEqual(key, expected);
}

/** Hash usado quando o email não existe, para igualar o tempo de resposta (evita enumeração). */
export const DUMMY_PASSWORD_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + Buffer.alloc(64).toString('base64url');
