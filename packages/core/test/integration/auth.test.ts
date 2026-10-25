import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, sessions, users, type DbHandle } from '@somar/db';
import {
  beginTotpEnrollment,
  completeTwoFactor,
  confirmTotpEnrollment,
  createAccount,
  disableTotp,
  signIn,
  signOut,
  signUp,
  totp,
  validateSession,
} from '../../src';
import { freshDb } from './helpers';

let h: DbHandle;
beforeEach(async () => {
  h?.close();
  h = await freshDb();
});
afterAll(async () => h?.close());

describe('autenticação email/palavra-passe', () => {
  it('regista, inicia sessão e termina sessão', async () => {
    const { token } = await signUp(h.db, { email: 'Rita@Exemplo.pt', password: 'palavra-passe-1', name: 'Rita' });
    const s = await validateSession(h.db, token);
    expect(s?.user.email).toBe('rita@exemplo.pt');
    expect(s?.twoFactorVerified).toBe(true);

    const login = await signIn(h.db, { email: 'RITA@exemplo.pt', password: 'palavra-passe-1' });
    expect(login.status).toBe('ok');
    await signOut(h.db, login.token);
    expect(await validateSession(h.db, login.token)).toBeNull();
  });

  it('guarda só o hash do token e da palavra-passe', async () => {
    const { token, userId } = await signUp(h.db, { email: 'a@b.pt', password: 'palavra-passe-1', name: 'Ab' });
    const rows = await h.db.select().from(sessions);
    expect(rows[0]!.id).not.toBe(token);
    const [u] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(u!.passwordHash).not.toContain('palavra-passe-1');
  });

  it('rejeita email duplicado, palavra-passe fraca e credenciais erradas', async () => {
    await signUp(h.db, { email: 'a@b.pt', password: 'palavra-passe-1', name: 'Ab' });
    await expect(signUp(h.db, { email: 'A@B.pt', password: 'palavra-passe-1', name: 'Ab' })).rejects.toThrow(/Já existe/);
    await expect(signUp(h.db, { email: 'c@b.pt', password: 'curta', name: 'Cd' })).rejects.toThrow(/pelo menos/);
    await expect(signIn(h.db, { email: 'a@b.pt', password: 'errada-123' })).rejects.toThrow(/incorretos/);
    await expect(signIn(h.db, { email: 'naoexiste@b.pt', password: 'errada-123' })).rejects.toThrow(/incorretos/);
    const failed = await h.db.select().from(auditLogs).where(eq(auditLogs.action, 'user.login_failed'));
    expect(failed).toHaveLength(2);
  });

  it('bloqueia força bruta por email', async () => {
    await signUp(h.db, { email: 'a@b.pt', password: 'palavra-passe-1', name: 'Ab' });
    for (let i = 0; i < 8; i++) {
      await expect(signIn(h.db, { email: 'a@b.pt', password: 'errada-123' })).rejects.toThrow(/incorretos/);
    }
    await expect(signIn(h.db, { email: 'a@b.pt', password: 'palavra-passe-1' })).rejects.toThrow(/Demasiadas/);
  });
});

describe('autenticação de dois fatores (TOTP)', () => {
  it('ativa o 2FA, exige o código no login, rejeita reutilização e aceita código de recuperação uma vez', async () => {
    const { userId, token } = await signUp(h.db, { email: 'a@b.pt', password: 'palavra-passe-1', name: 'Ab' });
    await createAccount(h.db, userId, {
      name: 'Ab Lda',
      legalForm: 'lda',
      nif: '500000000',
      vatRegime: 'normal_mensal',
      incomeTaxRegime: 'irc_geral',
      activityStartDate: '2024-01-01',
    });
    const { secret, uri } = await beginTotpEnrollment(h.db, userId);
    expect(uri).toContain('otpauth://totp/');
    const [stored] = await h.db.select().from(users).where(eq(users.id, userId));
    expect(stored!.totpSecretEnc).not.toContain(secret);

    await expect(confirmTotpEnrollment(h.db, userId, '000000')).rejects.toThrow(/inválido/);
    const { recoveryCodes } = await confirmTotpEnrollment(h.db, userId, totp(secret));
    expect(recoveryCodes).toHaveLength(10);
    expect(await validateSession(h.db, token)).not.toBeNull();

    const pending = await signIn(h.db, { email: 'a@b.pt', password: 'palavra-passe-1' });
    expect(pending.status).toBe('two_factor_required');
    const pendingSession = await validateSession(h.db, pending.token);
    expect(pendingSession?.twoFactorVerified).toBe(false);

    // O código usado na ativação não pode ser reutilizado.
    await expect(completeTwoFactor(h.db, pending.token, totp(secret))).rejects.toThrow(/inválido/);

    const full = await completeTwoFactor(h.db, pending.token, recoveryCodes[0]!);
    expect((await validateSession(h.db, full.token))?.twoFactorVerified).toBe(true);
    expect(await validateSession(h.db, pending.token)).toBeNull(); // token pendente rodado

    const again = await signIn(h.db, { email: 'a@b.pt', password: 'palavra-passe-1' });
    await expect(completeTwoFactor(h.db, again.token, recoveryCodes[0]!)).rejects.toThrow(/inválido/);

    await disableTotp(h.db, userId, 'palavra-passe-1');
    expect((await signIn(h.db, { email: 'a@b.pt', password: 'palavra-passe-1' })).status).toBe('ok');
  });
});

describe('onboarding da conta', () => {
  it('valida a coerência entre estatuto, regimes e NIF', async () => {
    const { userId } = await signUp(h.db, { email: 'a@b.pt', password: 'palavra-passe-1', name: 'Ab' });
    const base = {
      name: 'Atividade',
      legalForm: 'trabalhador_independente' as const,
      vatRegime: 'normal_trimestral' as const,
      incomeTaxRegime: 'irs_simplificado' as const,
      activityStartDate: '2024-01-01',
      mainIncomeType: 'servicos_tabela_151' as const,
    };
    await expect(createAccount(h.db, userId, { ...base, incomeTaxRegime: 'irc_geral' })).rejects.toThrow(/IRS/);
    await expect(createAccount(h.db, userId, { ...base, nif: '500000000' })).rejects.toThrow(/singular/);
    await expect(createAccount(h.db, userId, { ...base, mainIncomeType: undefined })).rejects.toThrow(/tipo principal/);
    await expect(
      createAccount(h.db, userId, { ...base, legalForm: 'lda', incomeTaxRegime: 'irc_geral', vatRegime: 'isento_art53' }),
    ).rejects.toThrow(/art. 53/);
    const acc = await createAccount(h.db, userId, { ...base, nif: '123456789' });
    expect(acc.onboardingCompletedAt).not.toBeNull();
  });
});
