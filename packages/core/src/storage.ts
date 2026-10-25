import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { decryptBuffer, encryptBuffer, sha256Hex, type Keyring, defaultKeyring } from './crypto';

/** Armazenamento de ficheiros. A implementação local encripta tudo em repouso (AES-256-GCM). */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[a-zA-Z0-9/_\-.]+$/;

function assertSafeKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.startsWith('/')) throw new Error('Chave de armazenamento inválida');
}

export class LocalEncryptedStorage implements FileStorage {
  constructor(
    private readonly root: string,
    private readonly ring: Keyring = defaultKeyring(),
  ) {}

  private resolve(key: string) {
    assertSafeKey(key);
    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, encryptBuffer(data, this.ring), { mode: 0o600 });
    await rename(tmp, target);
  }

  async get(key: string) {
    return decryptBuffer(await readFile(this.resolve(key)), this.ring);
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

/** Chave de armazenamento: separada por conta para facilitar a eliminação de dados (RGPD). */
export function storageKeyFor(accountId: string, kind: string, ext: string) {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() || 'bin';
  return `${accountId}/${kind}/${randomUUID()}.${safeExt}`;
}

export function fileChecksum(data: Buffer) {
  return sha256Hex(data);
}

let storage: FileStorage | undefined;
export function defaultStorage(): FileStorage {
  storage ??= new LocalEncryptedStorage(process.env.STORAGE_DIR || './data/files');
  return storage;
}

export function setDefaultStorage(s: FileStorage) {
  storage = s;
}
