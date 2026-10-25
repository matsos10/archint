import { and, eq, gt, sql } from 'drizzle-orm';
import { memberships, sessions, users, type Db } from '@somar/db';
import { audit } from './audit';
import { decryptString, encryptString, randomToken, sha256Hex } from './crypto';
import { AppError } from './errors';
import { DUMMY_PASSWORD_HASH, hashPassword, validatePasswordStrength, verifyPassword } from './password';
import { enforceRateLimit, resetRateLimit } from './rate-limit';
import { generateRecoveryCodes, generateTotpSecret, totpUri, verifyTotp } from './totp';

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const PENDING_2FA_TTL_MS = 10 * 60 * 1000;
const SESSION_REFRESH_MS = 3600 * 1000;

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  totpEnabled: boolean;
  isPlatformAdmin: boolean;
}

export interface ValidSession {
  sessionId: string;
  user: SessionUser;
  activeAccountId: string | null;
  twoFactorVerified: boolean;
  expiresAt: Date;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createSession(db: Db, userId: string, twoFactorVerified: boolean, meta: RequestMeta) {
  const token = randomToken(32);
  const ttl = twoFactorVerified ? SESSION_TTL_MS : PENDING_2FA_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  const [membership] = await db
    .select({ accountId: memberships.accountId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt)
    .limit(1);
  await db.insert(sessions).values({
    id: sha256Hex(token),
    userId,
    twoFactorVerified,
    expiresAt,
    activeAccountId: membership?.accountId ?? null,
    ip: meta.ip?.slice(0, 64) ?? null,
    userAgent: meta.userAgent?.slice(0, 400) ?? null,
  });
  return { token, expiresAt };
}

export async function signUp(
  db: Db,
  input: { email: string; password: string; name: string },
  meta: RequestMeta = {},
) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!EMAIL_RE.test(email)) throw new AppError('invalid_email', 'Email inválido.');
  if (name.length < 2) throw new AppError('invalid_name', 'Indica o teu nome.');
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new AppError('weak_password', weak);
  await enforceRateLimit(db, `signup:${meta.ip ?? 'unknown'}`, 10, 3600);

  const existing = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`);
  if (existing.length > 0) throw new AppError('email_taken', 'Já existe uma conta com este email.');

  const [user] = await db
    .insert(users)
    .values({ email, name, passwordHash: await hashPassword(input.password) })
    .returning({ id: users.id });
  await audit(db, { actorUserId: user!.id, action: 'user.signup', entityType: 'user', entityId: user!.id, ip: meta.ip });
  const session = await createSession(db, user!.id, true, meta);
  return { userId: user!.id, ...session };
}

export type SignInResult =
  | { status: 'ok'; token: string; expiresAt: Date; userId: string }
  | { status: 'two_factor_required'; token: string; expiresAt: Date; userId: string };

export async function signIn(
  db: Db,
  input: { email: string; password: string },
  meta: RequestMeta = {},
): Promise<SignInResult> {
  const email = normalizeEmail(input.email);
  await enforceRateLimit(db, `login:ip:${meta.ip ?? 'unknown'}`, 30, 900);
  await enforceRateLimit(db, `login:email:${email}`, 8, 900);

  const [user] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, sql`${users.deletedAt} is null`));
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !ok) {
    await audit(db, { actorUserId: user?.id, action: 'user.login_failed', data: { email }, ip: meta.ip });
    throw new AppError('invalid_credentials', 'Email ou palavra-passe incorretos.', 401);
  }
  await resetRateLimit(db, `login:email:${email}`);

  const needs2fa = user.totpEnabledAt != null;
  const session = await createSession(db, user.id, !needs2fa, meta);
  await audit(db, {
    actorUserId: user.id,
    action: needs2fa ? 'user.login_password_ok' : 'user.login',
    ip: meta.ip,
  });
  return { status: needs2fa ? 'two_factor_required' : 'ok', userId: user.id, ...session };
}

/** Valida o cookie de sessão. Sessões com 2FA pendente só servem para o passo do segundo fator. */
export async function validateSession(db: Db, token: string | undefined | null): Promise<ValidSession | null> {
  if (!token || token.length > 100) return null;
  const id = sha256Hex(token);
  const [row] = await db
    .select({
      session: sessions,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        totpEnabledAt: users.totpEnabledAt,
        isPlatformAdmin: users.isPlatformAdmin,
        deletedAt: users.deletedAt,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row || row.user.deletedAt) return null;

  if (row.session.twoFactorVerified && Date.now() - row.session.lastSeenAt.getTime() > SESSION_REFRESH_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(sessions.id, id));
  }
  return {
    sessionId: id,
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      totpEnabled: row.user.totpEnabledAt != null,
      isPlatformAdmin: row.user.isPlatformAdmin,
    },
    activeAccountId: row.session.activeAccountId,
    twoFactorVerified: row.session.twoFactorVerified,
    expiresAt: row.session.expiresAt,
  };
}

export async function signOut(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

export async function signOutEverywhere(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/** Segundo passo do login: código TOTP ou código de recuperação. */
export async function completeTwoFactor(db: Db, token: string, code: string, meta: RequestMeta = {}) {
  const id = sha256Hex(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row || row.session.twoFactorVerified || !row.user.totpSecretEnc) {
    throw new AppError('invalid_session', 'Sessão expirada. Inicia sessão novamente.', 401);
  }
  await enforceRateLimit(db, `2fa:${row.user.id}`, 10, 900);
  const user = row.user;
  const secret = decryptString(user.totpSecretEnc!, undefined, `totp:${user.id}`);
  const step = verifyTotp(secret, code, Date.now(), user.totpLastUsedStep);
  let usedRecovery = false;
  if (step != null) {
    await db.update(users).set({ totpLastUsedStep: step }).where(eq(users.id, user.id));
  } else {
    const hash = sha256Hex(code.trim().toLowerCase());
    if (!user.recoveryCodeHashes.includes(hash)) {
      await audit(db, { actorUserId: user.id, action: 'user.2fa_failed', ip: meta.ip });
      throw new AppError('invalid_code', 'Código inválido.', 401);
    }
    usedRecovery = true;
    await db
      .update(users)
      .set({ recoveryCodeHashes: user.recoveryCodeHashes.filter((h) => h !== hash) })
      .where(eq(users.id, user.id));
  }
  // Roda a sessão: o token pendente é substituído por um token novo, totalmente autenticado.
  await db.delete(sessions).where(eq(sessions.id, id));
  const session = await createSession(db, user.id, true, meta);
  await audit(db, { actorUserId: user.id, action: usedRecovery ? 'user.2fa_recovery_code' : 'user.login', ip: meta.ip });
  return session;
}

/** Inicia a ativação do 2FA: gera o segredo (guardado encriptado, ainda inativo). */
export async function beginTotpEnrollment(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AppError('not_found', 'Utilizador não encontrado.', 404);
  if (user.totpEnabledAt) throw new AppError('already_enabled', 'A autenticação de dois fatores já está ativa.');
  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ totpSecretEnc: encryptString(secret, undefined, `totp:${userId}`) })
    .where(eq(users.id, userId));
  return { secret, uri: totpUri(secret, user.email) };
}

/** Confirma o 2FA com um código válido; devolve os códigos de recuperação (mostrados uma única vez). */
export async function confirmTotpEnrollment(db: Db, userId: string, code: string, meta: RequestMeta = {}) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.totpSecretEnc || user.totpEnabledAt) throw new AppError('invalid_state', 'Inicia primeiro a configuração.');
  const secret = decryptString(user.totpSecretEnc, undefined, `totp:${userId}`);
  const step = verifyTotp(secret, code);
  if (step == null) throw new AppError('invalid_code', 'Código inválido. Confirma a hora do teu telemóvel.');
  const codes = generateRecoveryCodes();
  await db
    .update(users)
    .set({ totpEnabledAt: new Date(), totpLastUsedStep: step, recoveryCodeHashes: codes.map((c) => sha256Hex(c)) })
    .where(eq(users.id, userId));
  await audit(db, { actorUserId: userId, action: 'user.2fa_enabled', ip: meta.ip });
  return { recoveryCodes: codes };
}

export async function disableTotp(db: Db, userId: string, password: string, meta: RequestMeta = {}) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError('invalid_credentials', 'Palavra-passe incorreta.', 401);
  }
  await db
    .update(users)
    .set({ totpEnabledAt: null, totpSecretEnc: null, totpLastUsedStep: null, recoveryCodeHashes: [] })
    .where(eq(users.id, userId));
  await audit(db, { actorUserId: userId, action: 'user.2fa_disabled', ip: meta.ip });
}

/** Muda a conta ativa da sessão, verificando que o utilizador é membro dessa conta. */
export async function switchActiveAccount(db: Db, sessionId: string, userId: string, accountId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.accountId, accountId)));
  if (!m) throw new AppError('forbidden', 'Sem acesso a esta conta.', 403);
  await db.update(sessions).set({ activeAccountId: accountId }).where(eq(sessions.id, sessionId));
}

export async function getMembership(db: Db, userId: string, accountId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.accountId, accountId)));
  return m ?? null;
}
