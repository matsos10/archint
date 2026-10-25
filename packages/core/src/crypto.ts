import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Encriptação simétrica AES-256-GCM com rotação de chaves.
 *
 * ENCRYPTION_KEYS="1=<base64 32 bytes>,2=<base64 32 bytes>" — a versão mais alta é a chave corrente;
 * as anteriores continuam a desencriptar dados antigos.
 */
export interface Keyring {
  current: number;
  keys: Map<number, Buffer>;
}

export function parseKeyring(spec: string | undefined): Keyring {
  if (!spec) throw new Error('ENCRYPTION_KEYS não definido');
  const keys = new Map<number, Buffer>();
  for (const part of spec.split(',').map((p) => p.trim()).filter(Boolean)) {
    const [v, b64] = part.split('=', 2);
    const version = Number(v);
    if (!Number.isInteger(version) || version < 1 || !b64) throw new Error('ENCRYPTION_KEYS mal formado');
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) throw new Error(`Chave de encriptação v${version} tem de ter 32 bytes`);
    keys.set(version, key);
  }
  if (keys.size === 0) throw new Error('ENCRYPTION_KEYS vazio');
  return { current: Math.max(...keys.keys()), keys };
}

let cachedKeyring: Keyring | undefined;
export function defaultKeyring(): Keyring {
  cachedKeyring ??= parseKeyring(process.env.ENCRYPTION_KEYS);
  return cachedKeyring;
}

function keyFor(ring: Keyring, version: number): Buffer {
  const key = ring.keys.get(version);
  if (!key) throw new Error(`Chave de encriptação v${version} indisponível`);
  return key;
}

/** Encripta texto; formato: v<versão>.<iv>.<tag>.<ciphertext> (base64url). */
export function encryptString(plain: string, ring: Keyring = defaultKeyring(), aad = ''): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(ring, ring.current), iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v' + ring.current, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptString(token: string, ring: Keyring = defaultKeyring(), aad = ''): string {
  const [v, iv, tag, ct] = token.split('.');
  if (!v?.startsWith('v') || !iv || !tag || ct === undefined) throw new Error('Texto encriptado inválido');
  const decipher = createDecipheriv('aes-256-gcm', keyFor(ring, Number(v.slice(1))), Buffer.from(iv, 'base64url'));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

const FILE_MAGIC = Buffer.from('SMR1');

/** Encripta um ficheiro: MAGIC(4) | versão(2) | iv(12) | tag(16) | ciphertext. */
export function encryptBuffer(plain: Buffer, ring: Keyring = defaultKeyring()): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(ring, ring.current), iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const header = Buffer.alloc(2);
  header.writeUInt16BE(ring.current);
  return Buffer.concat([FILE_MAGIC, header, iv, cipher.getAuthTag(), ct]);
}

export function decryptBuffer(blob: Buffer, ring: Keyring = defaultKeyring()): Buffer {
  if (blob.length < 34 || !blob.subarray(0, 4).equals(FILE_MAGIC)) throw new Error('Ficheiro encriptado inválido');
  const version = blob.readUInt16BE(4);
  const iv = blob.subarray(6, 18);
  const tag = blob.subarray(18, 34);
  const decipher = createDecipheriv('aes-256-gcm', keyFor(ring, version), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(34)), decipher.final()]);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacSha256Hex(key: string | Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
