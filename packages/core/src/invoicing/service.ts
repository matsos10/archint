import { and, desc, eq, inArray, isNull, lt, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  accounts,
  clients,
  documentLines,
  documentSeries,
  files,
  invoiceReminders,
  invoices,
  payments,
  quotes,
  type TenantTx,
} from '@somar/db';
import { computeInvoice, validateInvoice, type InvoiceLineInput, type InvoiceTotals, type TaxParams } from '@somar/tax-engine';
import { audit } from '../audit';
import { decryptString } from '../crypto';
import { AppError } from '../errors';
import { formatEurPlain } from '../format';
import { isValidNif } from '../nif';
import { fileChecksum, storageKeyFor, type FileStorage } from '../storage';
import type { Mailer } from './mailer';
import { renderDocumentPdf, type DocumentPdfInput } from './pdf';
import type { InvoicingProvider } from './provider';

type Ctx = { accountId: string; userId: string };
type Account = typeof accounts.$inferSelect;
type Client = typeof clients.$inferSelect;

const DOC_TITLES: Record<string, string> = { FT: 'Fatura', FR: 'Fatura-recibo', FS: 'Fatura simplificada', NC: 'Nota de crédito', ND: 'Nota de débito', RC: 'Recibo' };
export const isIndividualAccount = (a: Account) => a.legalForm === 'trabalhador_independente' || a.legalForm === 'eni';

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const clientInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Indica o nome do cliente.').max(200),
    nif: opt(20),
    email: z.email('Email inválido.').optional().or(z.literal('').transform(() => undefined)),
    addressLine: opt(300),
    postalCode: opt(10),
    city: opt(100),
    country: z.string().length(2).default('PT'),
    isCompany: z.boolean().default(true),
    hasOrganizedAccounting: z.boolean().default(true),
    paymentTermsDays: z.number().int().min(0).max(365).default(30),
    notes: opt(2000),
  })
  .superRefine((v, ctx) => {
    if (v.nif && v.country === 'PT' && !isValidNif(v.nif)) ctx.addIssue({ code: 'custom', path: ['nif'], message: 'NIF inválido.' });
  });
export type ClientInput = z.input<typeof clientInputSchema>;

export async function saveClient(tx: TenantTx, ctx: Ctx, input: ClientInput, id?: string) {
  const v = clientInputSchema.parse(input);
  const values = { ...v, hasOrganizedAccounting: v.isCompany ? v.hasOrganizedAccounting : false };
  if (id) {
    const [row] = await tx.update(clients).set(values).where(and(eq(clients.id, id), eq(clients.accountId, ctx.accountId))).returning();
    if (!row) throw new AppError('not_found', 'Cliente não encontrado.', 404);
    return row;
  }
  const [row] = await tx.insert(clients).values({ accountId: ctx.accountId, ...values }).returning();
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'client.created', entityType: 'client', entityId: row!.id });
  return row!;
}

// ---------------------------------------------------------------------------
// Documentos (rascunhos)
// ---------------------------------------------------------------------------

export const lineInputSchema = z.object({
  description: z.string().trim().min(1, 'Descrição obrigatória.').max(500),
  quantity: z.number().positive('Quantidade inválida.').max(1_000_000),
  unit: z.string().max(20).default('un'),
  unitPriceCents: z.number().int().min(0).max(100_000_000_00),
  discountPct: z.number().min(0).max(100).default(0),
  vatRateCode: z.enum(['normal', 'intermedia', 'reduzida', 'isenta', 'nao_sujeita', 'autoliquidacao']),
  vatExemptionCode: z.string().max(3).nullish(),
});

export const documentInputSchema = z.object({
  clientId: z.uuid().nullish(),
  docType: z.enum(['FT', 'FR', 'FS']).default('FT'),
  issueDate: z.iso.date(),
  dueDate: z.iso.date().nullish(),
  validUntil: z.iso.date().nullish(),
  lines: z.array(lineInputSchema).min(1, 'Acrescenta pelo menos uma linha.').max(200),
  notes: opt(2000),
  /** null/undefined = regra legal; true/false = escolha explícita do utilizador. */
  applyWithholding: z.boolean().nullish(),
}).refine((v) => !v.dueDate || v.dueDate >= v.issueDate, { path: ['dueDate'], message: 'O vencimento não pode ser anterior à data da fatura.' });
export type DocumentInput = z.input<typeof documentInputSchema>;

export function computeForAccount(account: Account, client: Client | null, lines: InvoiceLineInput[], applyWithholding: boolean | null | undefined, params: TaxParams): InvoiceTotals {
  return computeInvoice(
    lines,
    {
      region: account.taxRegion,
      vatRegime: account.vatRegime,
      incomeType: account.mainIncomeType,
      providerIsIndividual: isIndividualAccount(account),
      providerWithholdingExempt: account.withholdingExempt,
      clientHasOrganizedAccounting: !!client?.isCompany && client.hasOrganizedAccounting,
      applyWithholding: applyWithholding ?? undefined,
    },
    params,
  );
}

async function loadAccountAndClient(tx: TenantTx, ctx: Ctx, clientId?: string | null) {
  const [account] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
  if (!account) throw new AppError('not_found', 'Conta não encontrada.', 404);
  let client: Client | null = null;
  if (clientId) {
    [client] = (await tx.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.accountId, ctx.accountId)))) as [Client];
    if (!client) throw new AppError('not_found', 'Cliente não encontrado.', 404);
  }
  return { account, client };
}

function lineRows(accountId: string, totals: InvoiceTotals, inputLines: z.output<typeof lineInputSchema>[], target: { invoiceId?: string; quoteId?: string }) {
  return totals.lines.map((l, i) => ({
    accountId,
    ...target,
    position: i + 1,
    description: l.description,
    quantity: l.quantity,
    unit: inputLines[i]?.unit ?? 'un',
    unitPriceCents: l.unitPriceCents,
    discountPct: l.discountPct ?? 0,
    vatRateCode: l.vatRateCode,
    vatRatePct: l.vatRatePct,
    vatExemptionCode: l.vatExemptionCode ?? null,
    netCents: l.netCents,
    vatCents: l.vatCents,
  }));
}

/** Cria ou atualiza uma fatura em rascunho (os valores são sempre recalculados pelo motor fiscal). */
export async function saveDraftInvoice(tx: TenantTx, ctx: Ctx, input: DocumentInput, params: TaxParams, id?: string) {
  const v = documentInputSchema.parse(input);
  const { account, client } = await loadAccountAndClient(tx, ctx, v.clientId);
  const totals = computeForAccount(account, client, v.lines, v.applyWithholding, params);
  const dueDate = v.dueDate ?? (v.docType === 'FT' ? addDays(v.issueDate, client?.paymentTermsDays ?? 30) : v.issueDate);
  const values = {
    docType: v.docType,
    clientId: client?.id ?? null,
    issueDate: v.issueDate,
    dueDate,
    notes: v.notes,
    netCents: totals.netCents,
    vatCents: totals.vatCents,
    withholdingCents: totals.withholdingCents,
    totalCents: totals.totalCents,
  };
  let invoiceId = id;
  if (id) {
    const [row] = await tx.select({ status: invoices.status }).from(invoices).where(and(eq(invoices.id, id), eq(invoices.accountId, ctx.accountId)));
    if (!row) throw new AppError('not_found', 'Fatura não encontrada.', 404);
    if (row.status !== 'draft') throw new AppError('immutable', 'Uma fatura emitida não pode ser alterada. Emite uma nota de crédito.');
    await tx.update(invoices).set(values).where(eq(invoices.id, id));
    await tx.delete(documentLines).where(eq(documentLines.invoiceId, id));
  } else {
    const [row] = await tx.insert(invoices).values({ accountId: ctx.accountId, status: 'draft', createdBy: ctx.userId, ...values }).returning({ id: invoices.id });
    invoiceId = row!.id;
  }
  await tx.insert(documentLines).values(lineRows(ctx.accountId, totals, v.lines, { invoiceId }));
  return { id: invoiceId!, totals };
}

export function addDays(iso: string, n: number) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------

export interface IssueDeps {
  provider: InvoicingProvider;
  storage: FileStorage;
  params: TaxParams;
  today?: string;
}

async function ensureSeries(tx: TenantTx, accountId: string, docType: string, year: number, provider: InvoicingProvider) {
  const code = `${year}A`;
  const [existing] = await tx
    .select()
    .from(documentSeries)
    .where(and(eq(documentSeries.accountId, accountId), eq(documentSeries.docType, docType), eq(documentSeries.code, code)))
    .for('update');
  if (existing) return existing;
  // A série é comunicada à AT (através do fornecedor certificado) antes do primeiro documento.
  const reg = await provider.registerSeries({ docType, code, year, firstNumber: 1 });
  const [created] = await tx
    .insert(documentSeries)
    .values({ accountId, docType, code, year, nextNumber: 1, atValidationCode: reg.validationCode, providerSeriesId: reg.providerSeriesId })
    .returning();
  return created!;
}

async function loadLines(tx: TenantTx, where: { invoiceId?: string; quoteId?: string }) {
  const rows = await tx
    .select()
    .from(documentLines)
    .where(where.invoiceId ? eq(documentLines.invoiceId, where.invoiceId) : eq(documentLines.quoteId, where.quoteId!))
    .orderBy(documentLines.position);
  return rows.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, unitPriceCents: l.unitPriceCents, discountPct: l.discountPct, vatRateCode: l.vatRateCode, vatExemptionCode: l.vatExemptionCode }));
}

function partyFromAccount(a: Account) {
  return { name: a.name, nif: a.nif, addressLine: a.addressLine, postalCode: a.postalCode, city: a.city, country: a.country, email: a.email };
}
function partyFromClient(c: Client | null) {
  return c
    ? { name: c.name, nif: c.nif, addressLine: c.addressLine, postalCode: c.postalCode, city: c.city, country: c.country, email: c.email }
    : { name: 'Consumidor final', nif: null, country: 'PT' };
}

/**
 * Emite uma fatura: valida os elementos obrigatórios, reserva o número na série (cronológico),
 * emite através do software certificado (ATCUD, QR, hash) e guarda o PDF. Depois de emitida,
 * a fatura é imutável.
 */
export async function issueInvoice(tx: TenantTx, deps: IssueDeps, ctx: Ctx, invoiceId: string) {
  if (!deps.provider.legallyValid && process.env.NODE_ENV === 'production' && process.env.INVOICING_SANDBOX !== '1') {
    throw new AppError('invoicing_unavailable', 'A faturação certificada ainda não está configurada. Não é possível emitir faturas com validade fiscal.');
  }
  const today = deps.today ?? new Date().toISOString().slice(0, 10);
  const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.accountId, ctx.accountId))).for('update');
  if (!inv) throw new AppError('not_found', 'Fatura não encontrada.', 404);
  if (inv.status !== 'draft') throw new AppError('already_issued', 'Esta fatura já foi emitida.');
  const { account, client } = await loadAccountAndClient(tx, ctx, inv.clientId);
  const lines = await loadLines(tx, { invoiceId });
  // Recalcula pelo motor; se o rascunho tinha uma escolha explícita de retenção, mantém-na.
  const ruleTotals = computeForAccount(account, client, lines, undefined, deps.params);
  const finalTotals = ruleTotals.withholdingCents === inv.withholdingCents ? ruleTotals : computeForAccount(account, client, lines, inv.withholdingCents > 0, deps.params);

  const year = Number(inv.issueDate.slice(0, 4));
  const series = await ensureSeries(tx, ctx.accountId, inv.docType, year, deps.provider);
  const [{ last } = { last: null }] = await tx
    .select({ last: max(invoices.issueDate) })
    .from(invoices)
    .where(and(eq(invoices.seriesId, series.id), inArray(invoices.status, ['issued', 'sent', 'partially_paid', 'paid', 'cancelled'])));
  let related: string | null = null;
  if (inv.relatedInvoiceId) {
    const [r] = await tx.select({ number: invoices.number }).from(invoices).where(eq(invoices.id, inv.relatedInvoiceId));
    related = r?.number ?? null;
  }
  const errors = validateInvoice({
    docType: inv.docType,
    issueDate: inv.issueDate,
    lastIssueDateInSeries: last,
    issuer: partyFromAccount(account),
    client: { name: client?.name, nif: client?.nif, isCompany: client?.isCompany, country: client?.country },
    totals: finalTotals,
    relatedInvoiceNumber: related,
    today,
  });
  if (errors.length) throw new AppError('invalid_invoice', errors.join(' '));

  const sequence = series.nextNumber;
  const result = await deps.provider.issue({
    docType: inv.docType as 'FT',
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    series: { code: series.code, validationCode: series.atValidationCode, providerSeriesId: series.providerSeriesId },
    localSequence: sequence,
    issuer: { ...partyFromAccount(account), region: account.taxRegion },
    client: partyFromClient(client),
    totals: finalTotals,
    notes: inv.notes,
    relatedDocumentNumber: related,
    reference: inv.id,
  });
  await tx.update(documentSeries).set({ nextNumber: Math.max(series.nextNumber, result.sequence) + 1 }).where(eq(documentSeries.id, series.id));

  const pdf =
    result.pdf ??
    (await renderDocumentPdf({
      ...(await pdfBase(tx, account, deps.storage)),
      kind: 'invoice',
      title: DOC_TITLES[inv.docType]!,
      number: result.number,
      issueDate: inv.issueDate,
      dueDate: inv.docType === 'FT' ? inv.dueDate : null,
      client: partyFromClient(client),
      totals: finalTotals,
      notes: inv.notes,
      atcud: result.atcud,
      qrPayload: result.qrPayload,
      documentHash: result.documentHash,
      certificateNumber: deps.provider.certificateNumber,
      relatedDocument: related,
      watermark: result.legallyValid ? null : 'DEMONSTRAÇÃO - SEM VALIDADE FISCAL',
    }));
  const pdfFileId = await storePdf(tx, deps.storage, ctx, pdf, `${result.number}.pdf`, 'invoice_pdf');
  const paidNow = inv.docType === 'FR' || inv.docType === 'FS';
  await tx
    .update(invoices)
    .set({
      status: paidNow ? 'paid' : 'issued',
      seriesId: series.id,
      number: result.number,
      sequence: result.sequence,
      atcud: result.atcud,
      qrPayload: result.qrPayload,
      documentHash: result.documentHash,
      provider: deps.provider.name,
      providerRef: result.providerRef,
      issuedAt: new Date(),
      clientSnapshot: partyFromClient(client) as Record<string, unknown>,
      netCents: finalTotals.netCents,
      vatCents: finalTotals.vatCents,
      withholdingCents: finalTotals.withholdingCents,
      totalCents: finalTotals.totalCents,
      paidCents: paidNow ? finalTotals.totalCents : 0,
      paidAt: paidNow ? new Date() : null,
      pdfFileId,
    })
    .where(eq(invoices.id, inv.id));
  if (paidNow) await tx.insert(payments).values({ accountId: ctx.accountId, invoiceId: inv.id, amountCents: finalTotals.totalCents, paidOn: inv.issueDate, method: 'pronto_pagamento' });
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'invoice.issued', entityType: 'invoice', entityId: inv.id, data: { number: result.number, atcud: result.atcud, provider: deps.provider.name, total: finalTotals.totalCents } });
  return { number: result.number, atcud: result.atcud, legallyValid: result.legallyValid };
}

async function pdfBase(tx: TenantTx, account: Account, storage: FileStorage): Promise<Pick<DocumentPdfInput, 'issuer' | 'brandColor' | 'logo' | 'iban'>> {
  let logo: DocumentPdfInput['logo'] = null;
  if (account.logoFileId) {
    const [f] = await tx.select().from(files).where(eq(files.id, account.logoFileId));
    if (f) logo = { data: await storage.get(f.storageKey), mimeType: f.mimeType };
  }
  let iban: string | null = null;
  if (account.iban) {
    try {
      iban = decryptString(account.iban, undefined, 'iban');
    } catch {
      iban = null;
    }
  }
  return { issuer: partyFromAccount(account), brandColor: account.brandColor, logo, iban };
}

async function storePdf(tx: TenantTx, storage: FileStorage, ctx: Ctx, pdf: Buffer, name: string, kind: 'invoice_pdf' | 'quote_pdf') {
  const key = storageKeyFor(ctx.accountId, kind === 'invoice_pdf' ? 'invoices' : 'quotes', 'pdf');
  await storage.put(key, pdf);
  const [f] = await tx
    .insert(files)
    .values({ accountId: ctx.accountId, kind, storageKey: key, originalName: name.replace(/[/\\]/g, '-'), mimeType: 'application/pdf', sizeBytes: pdf.length, sha256: fileChecksum(pdf), uploadedBy: ctx.userId })
    .returning({ id: files.id });
  return f!.id;
}

/** Nota de crédito total de uma fatura emitida (a única forma de "anular" uma fatura comunicada). */
export async function creditInvoice(tx: TenantTx, deps: IssueDeps, ctx: Ctx, invoiceId: string, reason: string) {
  const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.accountId, ctx.accountId)));
  if (!inv || inv.status === 'draft' || inv.docType === 'NC') throw new AppError('invalid_state', 'Só é possível creditar faturas emitidas.');
  if (inv.status === 'cancelled') throw new AppError('invalid_state', 'Esta fatura já foi anulada por nota de crédito.');
  const lines = await loadLines(tx, { invoiceId });
  const { account, client } = await loadAccountAndClient(tx, ctx, inv.clientId);
  const totals = computeForAccount(account, client, lines, inv.withholdingCents > 0, deps.params);
  const today = deps.today ?? new Date().toISOString().slice(0, 10);
  const [nc] = await tx
    .insert(invoices)
    .values({
      accountId: ctx.accountId,
      docType: 'NC',
      status: 'draft',
      clientId: inv.clientId,
      issueDate: today,
      relatedInvoiceId: inv.id,
      notes: `Anulação da ${inv.number}. Motivo: ${reason}`.slice(0, 2000),
      netCents: totals.netCents,
      vatCents: totals.vatCents,
      withholdingCents: totals.withholdingCents,
      totalCents: totals.totalCents,
      createdBy: ctx.userId,
    })
    .returning({ id: invoices.id });
  await tx.insert(documentLines).values(lineRows(ctx.accountId, totals, lines.map((l) => ({ ...l, unit: l.unit ?? 'un', discountPct: l.discountPct ?? 0 })), { invoiceId: nc!.id }));
  const r = await issueInvoice(tx, deps, ctx, nc!.id);
  await tx.update(invoices).set({ status: 'cancelled', remindersEnabled: false }).where(eq(invoices.id, inv.id));
  return { creditNoteId: nc!.id, ...r };
}

// ---------------------------------------------------------------------------
// Recebimentos
// ---------------------------------------------------------------------------

export async function recordPayment(tx: TenantTx, ctx: Ctx, invoiceId: string, input: { amountCents: number; paidOn: string; method?: string; transactionId?: string | null }) {
  const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.accountId, ctx.accountId))).for('update');
  if (!inv || !['issued', 'sent', 'partially_paid'].includes(inv.status)) throw new AppError('invalid_state', 'Esta fatura não está por receber.');
  if (!(input.amountCents > 0) || input.amountCents > inv.totalCents - inv.paidCents) throw new AppError('invalid_amount', `O valor tem de estar entre 0,01 € e ${formatEurPlain(inv.totalCents - inv.paidCents)}.`);
  await tx.insert(payments).values({ accountId: ctx.accountId, invoiceId, amountCents: input.amountCents, paidOn: input.paidOn, method: input.method ?? 'transferencia', transactionId: input.transactionId ?? null });
  const paid = inv.paidCents + input.amountCents;
  await tx
    .update(invoices)
    .set({ paidCents: paid, status: paid >= inv.totalCents ? 'paid' : 'partially_paid', paidAt: paid >= inv.totalCents ? new Date(input.paidOn) : null })
    .where(eq(invoices.id, invoiceId));
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'invoice.payment_recorded', entityType: 'invoice', entityId: invoiceId, data: { amount: input.amountCents } });
}

export function isOverdue(inv: { status: string; dueDate: string | null }, today: string) {
  return ['issued', 'sent', 'partially_paid'].includes(inv.status) && !!inv.dueDate && inv.dueDate < today;
}

// ---------------------------------------------------------------------------
// Envio por email e lembretes de cobrança
// ---------------------------------------------------------------------------

export interface SendDeps {
  mailer: Mailer;
  storage: FileStorage;
}

async function attachmentFor(tx: TenantTx, storage: FileStorage, fileId: string | null, name: string) {
  if (!fileId) return [];
  const [f] = await tx.select().from(files).where(eq(files.id, fileId));
  if (!f) return [];
  return [{ filename: name, content: await storage.get(f.storageKey), contentType: 'application/pdf' }];
}

export async function sendInvoiceEmail(tx: TenantTx, deps: SendDeps, ctx: Ctx, invoiceId: string, opts: { to?: string; message?: string } = {}) {
  const [row] = await tx
    .select({ inv: invoices, client: clients, account: accounts })
    .from(invoices)
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .innerJoin(accounts, eq(accounts.id, invoices.accountId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.accountId, ctx.accountId)));
  if (!row || row.inv.status === 'draft') throw new AppError('invalid_state', 'Emite a fatura antes de a enviar.');
  const to = opts.to ?? row.client?.email;
  if (!to) throw new AppError('no_email', 'O cliente não tem email. Indica um endereço.');
  const { inv, account } = row;
  const title = DOC_TITLES[inv.docType]!;
  const lines = [
    opts.message?.trim() || 'Olá,',
    '',
    `Segue em anexo a ${title.toLowerCase()} ${inv.number}, no valor de ${formatEurPlain(inv.totalCents)}.`,
    inv.dueDate && inv.docType === 'FT' ? `Data de vencimento: ${inv.dueDate.split('-').reverse().join('/')}.` : '',
    '',
    'Obrigado,',
    account.name,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  await deps.mailer.send({
    to,
    replyTo: account.email ?? undefined,
    subject: `${title} ${inv.number} — ${account.name}`,
    text: lines.join('\n'),
    attachments: await attachmentFor(tx, deps.storage, inv.pdfFileId, `${inv.number}.pdf`),
  });
  await tx.update(invoices).set({ sentAt: new Date(), status: inv.status === 'issued' ? 'sent' : inv.status }).where(eq(invoices.id, inv.id));
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'invoice.sent', entityType: 'invoice', entityId: inv.id, data: { to } });
}

/** Estágios de lembrete após o vencimento (dias). */
export const REMINDER_STAGES = [
  { stage: 1, daysAfterDue: 3 },
  { stage: 2, daysAfterDue: 15 },
  { stage: 3, daysAfterDue: 30 },
] as const;

export interface ReminderDraft {
  subject: string;
  body: string;
  aiGenerated: boolean;
}

/** Texto do lembrete (modelo determinístico; a Fase 6 pode propor um texto personalizado). */
export function defaultReminderText(input: { stage: number; number: string; amountCents: number; dueDate: string; daysLate: number; clientName: string; accountName: string; iban?: string | null }): ReminderDraft {
  const amount = formatEurPlain(input.amountCents);
  const due = input.dueDate.split('-').reverse().join('/');
  const pay = input.iban ? `\n\nPodes pagar por transferência para o IBAN ${input.iban}.` : '';
  const bodies: Record<number, string> = {
    1: `Olá ${input.clientName},\n\nEscrevo só para lembrar que a fatura ${input.number}, de ${amount}, venceu a ${due}. Se já fizeste o pagamento, ignora esta mensagem.${pay}\n\nObrigado,\n${input.accountName}`,
    2: `Olá ${input.clientName},\n\nA fatura ${input.number}, de ${amount}, está por pagar há ${input.daysLate} dias (vencimento a ${due}). Consegues confirmar quando será feito o pagamento?${pay}\n\nObrigado,\n${input.accountName}`,
    3: `Olá ${input.clientName},\n\nApesar dos lembretes anteriores, a fatura ${input.number}, de ${amount}, continua por pagar desde ${due}. Peço que regularizes o pagamento nos próximos dias ou que me contactes.${pay}\n\nCumprimentos,\n${input.accountName}`,
  };
  return { subject: `Lembrete: fatura ${input.number} por pagar`, body: bodies[input.stage]!, aiGenerated: false };
}

export type ReminderComposer = (input: Parameters<typeof defaultReminderText>[0]) => Promise<ReminderDraft>;

/** Envia os lembretes devidos hoje (idempotente por fatura e estágio). Devolve o número enviado. */
export async function sendDueReminders(tx: TenantTx, deps: SendDeps & { compose?: ReminderComposer }, accountId: string, today: string) {
  const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) return 0;
  const due = await tx
    .select({ inv: invoices, client: clients })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.accountId, accountId), inArray(invoices.status, ['issued', 'sent', 'partially_paid']), eq(invoices.remindersEnabled, true), lt(invoices.dueDate, today)));
  let iban: string | null = null;
  if (account.iban) {
    try {
      iban = decryptString(account.iban, undefined, 'iban');
    } catch {
      iban = null;
    }
  }
  let sent = 0;
  for (const { inv, client } of due) {
    if (!client.email || !inv.dueDate) continue;
    const daysLate = Math.round((Date.parse(today) - Date.parse(inv.dueDate)) / 86_400_000);
    const done = await tx.select({ stage: invoiceReminders.stage }).from(invoiceReminders).where(eq(invoiceReminders.invoiceId, inv.id));
    const doneStages = new Set(done.map((d) => d.stage));
    const stage = [...REMINDER_STAGES].reverse().find((s) => daysLate >= s.daysAfterDue);
    if (!stage || doneStages.has(stage.stage)) continue;
    const input = { stage: stage.stage, number: inv.number ?? '', amountCents: inv.totalCents - inv.paidCents, dueDate: inv.dueDate, daysLate, clientName: client.name, accountName: account.name, iban };
    let draft = defaultReminderText(input);
    if (deps.compose) {
      try {
        draft = await deps.compose(input);
      } catch {
        draft = defaultReminderText(input); // sem IA, continua com o modelo
      }
    }
    await deps.mailer.send({ to: client.email, replyTo: account.email ?? undefined, subject: draft.subject, text: draft.body, attachments: await attachmentFor(tx, deps.storage, inv.pdfFileId, `${inv.number}.pdf`) });
    await tx.insert(invoiceReminders).values({ accountId, invoiceId: inv.id, stage: stage.stage, subject: draft.subject, body: draft.body, aiGenerated: draft.aiGenerated });
    await tx.update(invoices).set({ lastReminderAt: new Date() }).where(eq(invoices.id, inv.id));
    await audit(tx, { accountId, actorType: 'system', action: 'invoice.reminder_sent', entityType: 'invoice', entityId: inv.id, data: { stage: stage.stage } });
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Orçamentos
// ---------------------------------------------------------------------------

export async function saveQuote(tx: TenantTx, ctx: Ctx, input: DocumentInput, params: TaxParams, id?: string) {
  const v = documentInputSchema.parse(input);
  const { account, client } = await loadAccountAndClient(tx, ctx, v.clientId);
  const totals = computeForAccount(account, client, v.lines, v.applyWithholding, params);
  const values = {
    clientId: client?.id ?? null,
    issueDate: v.issueDate,
    validUntil: v.validUntil ?? addDays(v.issueDate, 30),
    notes: v.notes,
    netCents: totals.netCents,
    vatCents: totals.vatCents,
    withholdingCents: totals.withholdingCents,
    totalCents: totals.totalCents,
  };
  let quoteId = id;
  if (id) {
    const [q] = await tx.select({ status: quotes.status }).from(quotes).where(and(eq(quotes.id, id), eq(quotes.accountId, ctx.accountId)));
    if (!q) throw new AppError('not_found', 'Orçamento não encontrado.', 404);
    if (q.status === 'invoiced') throw new AppError('immutable', 'Este orçamento já foi faturado.');
    await tx.update(quotes).set(values).where(eq(quotes.id, id));
    await tx.delete(documentLines).where(eq(documentLines.quoteId, id));
  } else {
    const year = v.issueDate.slice(0, 4);
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(quotes)
      .where(and(eq(quotes.accountId, ctx.accountId), sql`extract(year from ${quotes.issueDate}) = ${Number(year)}`));
    const [row] = await tx
      .insert(quotes)
      .values({ accountId: ctx.accountId, number: `OR ${year}/${Number(n) + 1}`, status: 'draft', createdBy: ctx.userId, ...values })
      .returning({ id: quotes.id });
    quoteId = row!.id;
  }
  await tx.insert(documentLines).values(lineRows(ctx.accountId, totals, v.lines, { quoteId }));
  return { id: quoteId!, totals };
}

export async function renderQuotePdf(tx: TenantTx, storage: FileStorage, ctx: Ctx, quoteId: string, params: TaxParams) {
  const [q] = await tx.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.accountId, ctx.accountId)));
  if (!q) throw new AppError('not_found', 'Orçamento não encontrado.', 404);
  const { account, client } = await loadAccountAndClient(tx, ctx, q.clientId);
  const lines = await loadLines(tx, { quoteId });
  const totals = computeForAccount(account, client, lines, q.withholdingCents > 0, params);
  const pdf = await renderDocumentPdf({ ...(await pdfBase(tx, account, storage)), kind: 'quote', title: 'Orçamento', number: q.number ?? '', issueDate: q.issueDate, validUntil: q.validUntil, client: partyFromClient(client), totals, notes: q.notes });
  const fileId = await storePdf(tx, storage, ctx, pdf, `${q.number}.pdf`, 'quote_pdf');
  await tx.update(quotes).set({ pdfFileId: fileId }).where(eq(quotes.id, q.id));
  return { fileId, pdf };
}

export async function sendQuoteEmail(tx: TenantTx, deps: SendDeps & { params: TaxParams }, ctx: Ctx, quoteId: string, opts: { to?: string; message?: string } = {}) {
  const { fileId } = await renderQuotePdf(tx, deps.storage, ctx, quoteId, deps.params);
  const [row] = await tx.select({ q: quotes, client: clients, account: accounts }).from(quotes).leftJoin(clients, eq(clients.id, quotes.clientId)).innerJoin(accounts, eq(accounts.id, quotes.accountId)).where(eq(quotes.id, quoteId));
  const to = opts.to ?? row?.client?.email;
  if (!row || !to) throw new AppError('no_email', 'O cliente não tem email. Indica um endereço.');
  await deps.mailer.send({
    to,
    replyTo: row.account.email ?? undefined,
    subject: `Orçamento ${row.q.number} — ${row.account.name}`,
    text: `${opts.message?.trim() || 'Olá,'}\n\nSegue em anexo o orçamento ${row.q.number}, no valor de ${formatEurPlain(row.q.totalCents)}, válido até ${row.q.validUntil?.split('-').reverse().join('/')}.\n\nObrigado,\n${row.account.name}`,
    attachments: await attachmentFor(tx, deps.storage, fileId, `${row.q.number}.pdf`),
  });
  await tx.update(quotes).set({ status: row.q.status === 'draft' ? 'sent' : row.q.status, sentAt: new Date() }).where(eq(quotes.id, quoteId));
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'quote.sent', entityType: 'quote', entityId: quoteId, data: { to } });
}

export async function setQuoteStatus(tx: TenantTx, ctx: Ctx, quoteId: string, status: 'accepted' | 'rejected') {
  const [q] = await tx.update(quotes).set({ status }).where(and(eq(quotes.id, quoteId), eq(quotes.accountId, ctx.accountId), inArray(quotes.status, ['draft', 'sent', 'accepted', 'rejected']))).returning();
  if (!q) throw new AppError('invalid_state', 'Não é possível alterar este orçamento.');
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: `quote.${status}`, entityType: 'quote', entityId: quoteId });
}

/** Converte um orçamento numa fatura em rascunho (a emitir pelo utilizador). */
export async function convertQuoteToInvoice(tx: TenantTx, ctx: Ctx, quoteId: string, params: TaxParams, issueDate: string) {
  const [q] = await tx.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.accountId, ctx.accountId)));
  if (!q || q.status === 'invoiced') throw new AppError('invalid_state', 'Este orçamento não pode ser faturado.');
  const lines = await loadLines(tx, { quoteId });
  const { id } = await saveDraftInvoice(
    tx,
    ctx,
    { clientId: q.clientId, docType: 'FT', issueDate, lines: lines.map((l) => ({ ...l, unit: l.unit ?? 'un', discountPct: l.discountPct ?? 0 })), notes: q.notes ?? undefined, applyWithholding: q.withholdingCents > 0 ? true : null },
    params,
  );
  await tx.update(quotes).set({ status: 'invoiced', invoiceId: id }).where(eq(quotes.id, quoteId));
  return id;
}

export async function listOpenReceivables(tx: TenantTx, accountId: string, today: string) {
  const rows = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.accountId, accountId), inArray(invoices.status, ['issued', 'sent', 'partially_paid']), isNull(invoices.relatedInvoiceId)))
    .orderBy(desc(invoices.dueDate));
  return {
    totalCents: rows.reduce((s, r) => s + r.totalCents - r.paidCents, 0),
    overdueCents: rows.filter((r) => isOverdue(r, today)).reduce((s, r) => s + r.totalCents - r.paidCents, 0),
    count: rows.length,
  };
}
