import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { files, receipts, transactions, type TenantTx } from '@somar/db';
import { parseAtQrCode, qrNetCents, qrVatCents, validateAtQr, type AtQrData } from '@somar/tax-engine';
import { audit } from './audit';
import { normalizeDescription } from './banking/normalize';
import { fileChecksum, storageKeyFor, type FileStorage } from './storage';
import { AppError } from './errors';
import { isValidNif } from './nif';

export const RECEIPT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Dados de um justificativo, extraídos (QR/OCR/IA) ou introduzidos pelo utilizador. */
export const receiptDataSchema = z.object({
  supplierName: z.string().trim().max(200).optional(),
  supplierNif: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidNif(v), 'NIF do fornecedor inválido.'),
  documentNumber: z.string().trim().max(60).optional(),
  atcud: z.string().trim().max(100).optional(),
  documentDate: z.iso.date().optional(),
  totalCents: z.number().int().optional(),
  vatCents: z.number().int().min(0).optional(),
});
export type ReceiptData = z.infer<typeof receiptDataSchema>;

export function receiptDataFromQr(q: AtQrData): ReceiptData & { netCents: number; issues: string[] } {
  return {
    supplierNif: q.issuerNif,
    documentNumber: q.docId,
    atcud: q.atcud,
    documentDate: q.date,
    totalCents: q.totalCents,
    vatCents: qrVatCents(q),
    netCents: qrNetCents(q),
    issues: validateAtQr(q),
  };
}

export async function uploadReceipt(
  tx: TenantTx,
  storage: FileStorage,
  ctx: { accountId: string; userId: string },
  file: { name: string; mimeType: string; data: Buffer },
  extra: { qrPayload?: string } = {},
) {
  if (!RECEIPT_MIME.includes(file.mimeType)) throw new AppError('invalid_file', 'Formato não suportado. Usa JPG, PNG, WEBP, HEIC ou PDF.');
  if (file.data.length > RECEIPT_MAX_BYTES) throw new AppError('file_too_large', 'O ficheiro tem mais de 10 MB.');
  const ext = file.name.split('.').pop() ?? 'bin';
  const key = storageKeyFor(ctx.accountId, 'receipts', ext);
  await storage.put(key, file.data);
  const [f] = await tx
    .insert(files)
    .values({
      accountId: ctx.accountId,
      kind: 'receipt',
      storageKey: key,
      originalName: file.name.slice(0, 300),
      mimeType: file.mimeType,
      sizeBytes: file.data.length,
      sha256: fileChecksum(file.data),
      uploadedBy: ctx.userId,
    })
    .returning();
  let data: Partial<typeof receipts.$inferInsert> = {};
  const qr = extra.qrPayload ? parseAtQrCode(extra.qrPayload) : null;
  if (qr) {
    const d = receiptDataFromQr(qr);
    data = {
      supplierNif: d.supplierNif,
      documentNumber: d.documentNumber,
      atcud: d.atcud,
      documentDate: d.documentDate,
      totalCents: d.totalCents,
      vatCents: d.vatCents,
      extracted: { source: 'qr', ...d } as Record<string, unknown>,
      extractionConfidence: d.issues.length ? 0.6 : 0.99,
      status: 'extracted',
    };
  }
  const [r] = await tx.insert(receipts).values({ accountId: ctx.accountId, fileId: f!.id, status: 'uploaded', ...data }).returning();
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'receipt.uploaded', entityType: 'receipt', entityId: r!.id });
  return r!;
}

// ---------------------------------------------------------------------------
// Associação justificativo ↔ movimento bancário
// ---------------------------------------------------------------------------

interface MatchCandidate {
  id: string;
  bookingDate: string;
  amountCents: number;
  description: string;
  duplicateOfId: string | null;
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Pontuação 0–1: o montante tem de coincidir (±1 cêntimo); a proximidade da data e a semelhança
 * do nome do fornecedor com a descrição aumentam a confiança.
 */
export function matchScore(
  r: { totalCents?: number | null; documentDate?: string | null; supplierName?: string | null },
  t: MatchCandidate,
): number {
  if (r.totalCents == null || t.amountCents >= 0 || Math.abs(-t.amountCents - r.totalCents) > 1) return 0;
  let score = 0.55;
  if (r.documentDate) {
    const d = dayDiff(r.documentDate, t.bookingDate);
    if (d > 20) return 0;
    score += 0.3 * (1 - d / 20);
  }
  if (r.supplierName) {
    const words = normalizeDescription(r.supplierName).split(' ').filter((w) => w.length > 2 && !['LDA', 'UNIPESSOAL'].includes(w));
    const desc = normalizeDescription(t.description);
    if (words.some((w) => desc.includes(w))) score += 0.15;
  }
  if (t.duplicateOfId) score -= 0.05; // prefere o original a um possível duplicado
  return Math.min(1, score);
}

export function bestMatch(r: Parameters<typeof matchScore>[0], candidates: MatchCandidate[]) {
  const scored = candidates.map((c) => ({ c, s: matchScore(r, c) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const [first, second] = scored;
  if (!first) return null;
  const unique = !second || first.s - second.s >= 0.04;
  return { transactionId: first.c.id, score: first.s, confident: first.s >= 0.75 && unique };
}

/** Associa automaticamente os justificativos sem movimento ao movimento mais provável (quando inequívoco). */
export async function autoMatchReceipts(tx: TenantTx, accountId: string): Promise<number> {
  const pending = await tx
    .select()
    .from(receipts)
    .where(and(eq(receipts.accountId, accountId), isNull(receipts.transactionId), inArray(receipts.status, ['extracted', 'confirmed', 'uploaded'])));
  if (!pending.length) return 0;
  const linked = await tx.select({ id: receipts.transactionId }).from(receipts).where(and(eq(receipts.accountId, accountId), sql`${receipts.transactionId} is not null`));
  const taken = new Set(linked.map((l) => l.id));
  const cands = (
    await tx
      .select({ id: transactions.id, bookingDate: transactions.bookingDate, amountCents: transactions.amountCents, description: transactions.description, duplicateOfId: transactions.duplicateOfId })
      .from(transactions)
      .where(and(eq(transactions.accountId, accountId), sql`${transactions.amountCents} < 0`))
  ).filter((c) => !taken.has(c.id));
  let n = 0;
  for (const r of pending.sort((a, b) => (a.documentDate ?? '').localeCompare(b.documentDate ?? ''))) {
    const m = bestMatch(r, cands.filter((c) => !taken.has(c.id)));
    if (!m?.confident) continue;
    await tx.update(receipts).set({ transactionId: m.transactionId, status: r.status === 'confirmed' ? 'confirmed' : 'matched' }).where(eq(receipts.id, r.id));
    taken.add(m.transactionId);
    n++;
  }
  return n;
}

/** O utilizador confirma (ou corrige) os dados do justificativo e a associação. */
export async function confirmReceipt(
  tx: TenantTx,
  ctx: { accountId: string; userId: string },
  receiptId: string,
  input: ReceiptData & { transactionId?: string | null },
) {
  const data = receiptDataSchema.parse(input);
  const [r] = await tx
    .update(receipts)
    .set({ ...data, transactionId: input.transactionId === undefined ? undefined : input.transactionId, status: 'confirmed', confirmedBy: ctx.userId, confirmedAt: new Date() })
    .where(and(eq(receipts.id, receiptId), eq(receipts.accountId, ctx.accountId)))
    .returning();
  if (!r) throw new AppError('not_found', 'Justificativo não encontrado.', 404);
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'receipt.confirmed', entityType: 'receipt', entityId: receiptId });
  return r;
}
