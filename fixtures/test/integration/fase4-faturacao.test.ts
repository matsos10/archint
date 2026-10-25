/**
 * Teste de aceitação da Fase 4: as 8 faturas do caso de referência são emitidas pelo serviço de
 * faturação (fornecedor sandbox), com numeração da série 2025A, ATCUD e QR; os valores coincidem com
 * os do caso de referência; os recebimentos do extrato liquidam 7 faturas e a 8.ª recebe lembrete.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { accounts, bankAccounts, invoices, withTenant, type DbHandle } from '@somar/db';
import { connectTestDb, truncateAll } from '@somar/db/testing';
import { runSeeders } from '@somar/db/seed';
import {
  LocalEncryptedStorage,
  MemoryMailer,
  SandboxInvoicingProvider,
  createAccount,
  importTransactions,
  invalidateTaxParamsCache,
  issueInvoice,
  loadTaxParams,
  parseBankCsv,
  parseKeyring,
  saveClient,
  saveDraftInvoice,
  sendDueReminders,
  signUp,
} from '@somar/core';
import { parseAtQrCode, validateAtQr } from '@somar/tax-engine';
import { fixture } from '../../eni-simplificado-2025';

let h: DbHandle;
let ctx: { accountId: string; userId: string };
const storage = new LocalEncryptedStorage(mkdtempSync(path.join(os.tmpdir(), 'somar-f4-')), parseKeyring('1=' + Buffer.alloc(32, 5).toString('base64')));
const provider = new SandboxInvoicingProvider();

beforeAll(async () => {
  h = connectTestDb();
  await truncateAll(h);
  await runSeeders(h.db);
  invalidateTaxParamsCache();
  const { userId } = await signUp(h.db, { email: 'marta4@exemplo.pt', password: 'palavra-passe-1', name: 'Marta Ferreira' });
  const account = await createAccount(h.db, userId, fixture.account as Parameters<typeof createAccount>[2]);
  await h.db.update(accounts).set({ addressLine: fixture.account.addressLine, postalCode: fixture.account.postalCode, city: fixture.account.city }).where(eq(accounts.id, account.id));
  ctx = { accountId: account.id, userId };
});
afterAll(async () => h?.close());

describe('Fase 4 — faturação do caso de referência', () => {
  it('emite as 8 faturas com os valores, numeração, ATCUD e QR esperados', async () => {
    const params = (await loadTaxParams(h.db)).resolve(2025);
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const ids = new Map<string, string>();
      for (const c of fixture.clients) {
        ids.set(c.key, (await saveClient(tx, ctx, { name: c.name, nif: c.nif, email: c.email, isCompany: c.isCompany, hasOrganizedAccounting: c.hasOrganizedAccounting })).id);
      }
      for (const f of fixture.invoices) {
        const d = await saveDraftInvoice(
          tx,
          ctx,
          { clientId: ids.get(f.client), issueDate: f.issueDate, dueDate: f.dueDate, lines: f.lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, vatRateCode: 'normal' as const })) },
          params,
        );
        const r = await issueInvoice(tx, { provider, storage, params, today: '2025-12-31' }, ctx, d.id);
        expect(r.number).toBe(f.number);
        const [inv] = await tx.select().from(invoices).where(eq(invoices.id, d.id));
        expect({ net: inv!.netCents, vat: inv!.vatCents, wh: inv!.withholdingCents, total: inv!.totalCents }).toEqual({ net: f.netCents, vat: f.vatCents, wh: f.withholdingCents, total: f.totalCents });
        expect(inv!.atcud).toBe(`${(await provider.registerSeries({ docType: 'FT', code: '2025A', year: 2025 })).validationCode}-${f.sequence}`);
        const qr = parseAtQrCode(inv!.qrPayload!)!;
        expect(validateAtQr(qr)).toEqual([]);
        expect(qr.buyerNif).toBe(fixture.clients.find((c) => c.key === f.client)!.nif);
      }
    });
  });

  it('os recebimentos do extrato liquidam as faturas e a 8.ª, vencida, recebe lembrete', async () => {
    const mailer = new MemoryMailer();
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const [b] = await tx.insert(bankAccounts).values({ accountId: ctx.accountId, source: 'csv', name: 'Conta à ordem' }).returning();
      const r = await importTransactions(tx, { accountId: ctx.accountId }, b!.id, parseBankCsv(fixture.bankCsv()).rows);
      expect(r.invoicesMatched).toBe(7);
      const all = await tx.select().from(invoices).orderBy(invoices.sequence);
      expect(all.map((i) => i.status)).toEqual(['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'issued']);
      // FT 2025A/8 vence a 18/01/2026; a 21/01/2026 está 3 dias em atraso → 1.º lembrete
      expect(await sendDueReminders(tx, { mailer, storage }, ctx.accountId, '2026-01-21')).toBe(1);
      expect(mailer.sent[0]).toMatchObject({ to: 'geral@padarialusa.example', subject: 'Lembrete: fatura FT 2025A/8 por pagar' });
    });
  });
});
