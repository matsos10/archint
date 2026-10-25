'use server';

import { revalidatePath } from 'next/cache';
import { audit, autoMatchReceipts, confirmReceipt, defaultStorage, refreshInsights, uploadReceipt } from '@somar/core';
import { withTenant } from '@somar/db';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

const euroToCents = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').replace(/\s/g, '').replace(',', '.');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
};

export async function uploadReceiptAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  const list = fd.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!list.length) return { error: 'Escolhe ou fotografa pelo menos um justificativo.' };
  try {
    const qr = String(fd.get('qr') ?? '').trim() || undefined;
    await withTenant(getDb(), ctx.accountId, async (tx) => {
      for (const f of list.slice(0, 20)) {
        await uploadReceipt(tx, defaultStorage(), ctx, { name: f.name, mimeType: f.type || 'application/octet-stream', data: Buffer.from(await f.arrayBuffer()) }, { qrPayload: list.length === 1 ? qr : undefined });
      }
      await autoMatchReceipts(tx, ctx.accountId);
      await refreshInsights(tx, ctx.accountId);
    });
    revalidatePath('/app/despesas');
    return { ok: true, message: `${list.length} justificativo(s) carregado(s).` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function confirmReceiptAction(receiptId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  try {
    await withTenant(getDb(), ctx.accountId, async (tx) => {
      const transactionId = String(fd.get('transactionId') ?? '');
      await confirmReceipt(tx, ctx, receiptId, {
        supplierName: String(fd.get('supplierName') ?? '') || undefined,
        supplierNif: String(fd.get('supplierNif') ?? '') || undefined,
        documentNumber: String(fd.get('documentNumber') ?? '') || undefined,
        documentDate: String(fd.get('documentDate') ?? '') || undefined,
        totalCents: euroToCents(fd.get('total')),
        vatCents: euroToCents(fd.get('vat')),
        transactionId: transactionId === '' ? undefined : transactionId === 'none' ? null : transactionId,
      });
      await autoMatchReceipts(tx, ctx.accountId);
      await refreshInsights(tx, ctx.accountId);
      await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'receipt.edited', entityType: 'receipt', entityId: receiptId });
    });
    revalidatePath('/app/despesas');
    revalidatePath('/app/transacoes');
    return { ok: true, message: 'Justificativo confirmado.' };
  } catch (e) {
    return toActionError(e);
  }
}
