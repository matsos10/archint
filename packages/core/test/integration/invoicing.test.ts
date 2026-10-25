import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { accounts, invoiceReminders, invoices, quotes, withTenant, type DbHandle } from '@somar/db';
import { parseAtQrCode, validateAtQr } from '@somar/tax-engine';
import {
  LocalEncryptedStorage,
  MemoryMailer,
  SandboxInvoicingProvider,
  addDays,
  convertQuoteToInvoice,
  creditInvoice,
  encryptString,
  issueInvoice,
  loadTaxParams,
  parseKeyring,
  recordPayment,
  saveClient,
  saveDraftInvoice,
  saveQuote,
  sendDueReminders,
  sendInvoiceEmail,
  sendQuoteEmail,
  setQuoteStatus,
} from '../../src';
import { freshDb, makeUserWithAccount } from './helpers';

let h: DbHandle;
const today = new Date().toISOString().slice(0, 10);
const storage = new LocalEncryptedStorage(mkdtempSync(path.join(os.tmpdir(), 'somar-inv-')), parseKeyring('1=' + Buffer.alloc(32, 9).toString('base64')));
const provider = new SandboxInvoicingProvider();

beforeEach(async () => {
  h?.close();
  h = await freshDb();
});
afterAll(async () => h?.close());

async function setup() {
  const a = await makeUserWithAccount(h, 'Marta');
  await h.db
    .update(accounts)
    .set({ addressLine: 'Rua das Flores, 12', postalCode: '4050-262', city: 'Porto', email: 'marta@exemplo.pt', iban: encryptString('PT50000201231234567890154', undefined, 'iban') })
    .where(eq(accounts.id, a.accountId));
  const ctx = { accountId: a.accountId, userId: a.userId };
  const params = (await loadTaxParams(h.db, { fresh: true })).resolve(Number(today.slice(0, 4)));
  const client = await withTenant(h.db, a.accountId, (tx) => saveClient(tx, ctx, { name: 'Atlântico Software, Lda.', nif: '509123457', email: 'contas@atlantico.example' }));
  return { ctx, params, client };
}

const line = (eur: number) => ({ description: 'Design de interface', quantity: 1, unitPriceCents: Math.round(eur * 100), vatRateCode: 'normal' as const });

describe('faturação (fornecedor sandbox)', () => {
  it('emite com numeração, ATCUD e QR válidos, e a fatura fica imutável', async () => {
    const { ctx, params, client } = await setup();
    const mailer = new MemoryMailer();
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const draft = await saveDraftInvoice(tx, ctx, { clientId: client.id, issueDate: today, lines: [line(3000)] }, params);
      expect(draft.totals).toMatchObject({ netCents: 300000, vatCents: 69000, withholdingCents: 69000, totalCents: 300000 });
      const r = await issueInvoice(tx, { provider, storage, params, today }, ctx, draft.id);
      const year = today.slice(0, 4);
      expect(r.number).toBe(`FT ${year}A/1`);
      expect(r.legallyValid).toBe(false);
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, draft.id));
      expect(inv!.status).toBe('issued');
      expect(inv!.atcud).toMatch(/^SB[A-Z0-9]{6}-1$/);
      const qr = parseAtQrCode(inv!.qrPayload!)!;
      expect(qr).toMatchObject({ issuerNif: '123456789', buyerNif: '509123457', totalCents: 369000, withholdingCents: 69000, atcud: inv!.atcud });
      expect(validateAtQr(qr)).toEqual([]);
      expect(inv!.pdfFileId).not.toBeNull();

      await expect(saveDraftInvoice(tx, ctx, { clientId: client.id, issueDate: today, lines: [line(1)] }, params, draft.id)).rejects.toThrow(/não pode ser alterada/);
      await expect(issueInvoice(tx, { provider, storage, params, today }, ctx, draft.id)).rejects.toThrow(/já foi emitida/);

      await sendInvoiceEmail(tx, { mailer, storage }, ctx, draft.id);
      expect(mailer.sent[0]!.to).toBe('contas@atlantico.example');
      expect(mailer.sent[0]!.attachments![0]!.content.subarray(0, 5).toString()).toBe('%PDF-');
      const [sent] = await tx.select().from(invoices).where(eq(invoices.id, draft.id));
      expect(sent!.status).toBe('sent');

      await recordPayment(tx, ctx, draft.id, { amountCents: 100000, paidOn: today });
      expect((await tx.select().from(invoices).where(eq(invoices.id, draft.id)))[0]!.status).toBe('partially_paid');
      await expect(recordPayment(tx, ctx, draft.id, { amountCents: 300000, paidOn: today })).rejects.toThrow(/entre/);
      await recordPayment(tx, ctx, draft.id, { amountCents: 200000, paidOn: today });
      expect((await tx.select().from(invoices).where(eq(invoices.id, draft.id)))[0]!.status).toBe('paid');
    });
  });

  it('impede datas anteriores ao último documento da série e exige dados do emitente', async () => {
    const { ctx, params, client } = await setup();
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const d1 = await saveDraftInvoice(tx, ctx, { clientId: client.id, issueDate: today, lines: [line(100)] }, params);
      await issueInvoice(tx, { provider, storage, params, today }, ctx, d1.id);
      const d2 = await saveDraftInvoice(tx, ctx, { clientId: client.id, issueDate: addDays(today, -1), lines: [line(100)] }, params);
      await expect(issueInvoice(tx, { provider, storage, params, today }, ctx, d2.id)).rejects.toThrow(/anterior à do último documento/);
      await tx.update(accounts).set({ addressLine: null });
      const d3 = await saveDraftInvoice(tx, ctx, { clientId: client.id, issueDate: today, lines: [line(100)] }, params);
      await expect(issueInvoice(tx, { provider, storage, params, today }, ctx, d3.id)).rejects.toThrow(/morada/);
    });
  });

  it('fatura-recibo fica paga; nota de crédito anula a fatura', async () => {
    const { ctx, params, client } = await setup();
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const fr = await saveDraftInvoice(tx, ctx, { clientId: client.id, docType: 'FR', issueDate: today, lines: [line(500)] }, params);
      const r = await issueInvoice(tx, { provider, storage, params, today }, ctx, fr.id);
      expect(r.number.startsWith('FR ')).toBe(true);
      expect((await tx.select().from(invoices).where(eq(invoices.id, fr.id)))[0]!.status).toBe('paid');

      const ft = await saveDraftInvoice(tx, ctx, { clientId: client.id, issueDate: today, lines: [line(800)] }, params);
      await issueInvoice(tx, { provider, storage, params, today }, ctx, ft.id);
      const nc = await creditInvoice(tx, { provider, storage, params, today }, ctx, ft.id, 'Serviço não prestado');
      expect(nc.number.startsWith('NC ')).toBe(true);
      const [orig] = await tx.select().from(invoices).where(eq(invoices.id, ft.id));
      const [credit] = await tx.select().from(invoices).where(eq(invoices.id, nc.creditNoteId));
      expect(orig!.status).toBe('cancelled');
      expect(credit).toMatchObject({ docType: 'NC', relatedInvoiceId: ft.id, totalCents: orig!.totalCents });
    });
  });

  it('envia lembretes por estágio, sem repetir', async () => {
    const { ctx, params, client } = await setup();
    const mailer = new MemoryMailer();
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const d = await saveDraftInvoice(tx, ctx, { clientId: client.id, issueDate: addDays(today, -40), dueDate: addDays(today, -10), lines: [line(1000)] }, params);
      await issueInvoice(tx, { provider, storage, params, today }, ctx, d.id);
      expect(await sendDueReminders(tx, { mailer, storage }, ctx.accountId, today)).toBe(1);
      expect(await sendDueReminders(tx, { mailer, storage }, ctx.accountId, today)).toBe(0);
      expect(mailer.sent[0]!.text).toMatch(/venceu/);
      expect(mailer.sent[0]!.text).toMatch(/PT50000201231234567890154/);
      expect(await sendDueReminders(tx, { mailer, storage }, ctx.accountId, addDays(today, 6))).toBe(1); // 16 dias: 2.º estágio
      const stages = await tx.select({ stage: invoiceReminders.stage }).from(invoiceReminders);
      expect(stages.map((s) => s.stage).sort()).toEqual([1, 2]);
      // Uma composição de IA que falha não impede o lembrete (usa o modelo)
      const n = await sendDueReminders(tx, { mailer, storage, compose: async () => { throw new Error('IA indisponível'); } }, ctx.accountId, addDays(today, 25));
      expect(n).toBe(1);
    });
  });

  it('orçamento: envio, aceitação e conversão em fatura', async () => {
    const { ctx, params, client } = await setup();
    const mailer = new MemoryMailer();
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const q = await saveQuote(tx, ctx, { clientId: client.id, issueDate: today, lines: [line(1200), { ...line(300), description: 'Revisões' }] }, params);
      await sendQuoteEmail(tx, { mailer, storage, params }, ctx, q.id);
      expect(mailer.sent[0]!.subject).toMatch(/^Orçamento OR \d{4}\/1/);
      await setQuoteStatus(tx, ctx, q.id, 'accepted');
      const invoiceId = await convertQuoteToInvoice(tx, ctx, q.id, params, today);
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId));
      expect(inv).toMatchObject({ status: 'draft', netCents: 150000 });
      expect((await tx.select().from(quotes).where(eq(quotes.id, q.id)))[0]!.status).toBe('invoiced');
      await expect(convertQuoteToInvoice(tx, ctx, q.id, params, today)).rejects.toThrow();
    });
  });
});
