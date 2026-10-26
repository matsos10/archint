'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { invoices, withTenant } from '@somar/db';
import {
  convertQuoteToInvoice,
  creditInvoice,
  issueInvoice,
  recordPayment,
  renderQuotePdf,
  saveClient,
  saveDraftInvoice,
  saveQuote,
  sendInvoiceEmail,
  sendQuoteEmail,
  setQuoteStatus,
  type ClientInput,
  type DocumentInput,
} from '@somar/core';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { invoicingDeps } from '@/lib/invoicing';
import { toActionError, type ActionState } from '@/lib/action';

export async function saveInvoiceAction(input: DocumentInput, id?: string): Promise<ActionState | void> {
  const ctx = await requireAccount();
  const deps = await invoicingDeps();
  let saved: string;
  try {
    saved = (await withTenant(getDb(), ctx, (tx) => saveDraftInvoice(tx, ctx, input, deps.params, id))).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/app/faturas');
  redirect(`/app/faturas/${saved}`);
}

export async function issueInvoiceAction(id: string): Promise<ActionState> {
  const ctx = await requireAccount();
  const deps = await invoicingDeps();
  try {
    const r = await withTenant(getDb(), ctx, (tx) => issueInvoice(tx, deps, ctx, id));
    revalidatePath('/app/faturas');
    revalidatePath(`/app/faturas/${id}`);
    return { ok: true, message: `Emitida: ${r.number}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function sendInvoiceAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  const deps = await invoicingDeps();
  try {
    await withTenant(getDb(), ctx, (tx) => sendInvoiceEmail(tx, deps, ctx, id, { to: String(fd.get('to') ?? '') || undefined, message: String(fd.get('message') ?? '') || undefined }));
    revalidatePath(`/app/faturas/${id}`);
    return { ok: true, message: 'Enviada por email.' };
  } catch (e) {
    return toActionError(e);
  }
}

export async function paymentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  try {
    const amount = Math.round(Number(String(fd.get('amount') ?? '').replace(',', '.')) * 100);
    await withTenant(getDb(), ctx, (tx) => recordPayment(tx, ctx, id, { amountCents: amount, paidOn: String(fd.get('paidOn')), method: String(fd.get('method') ?? 'transferencia') }));
    revalidatePath(`/app/faturas/${id}`);
    revalidatePath('/app/faturas');
    return { ok: true, message: 'Recebimento registado.' };
  } catch (e) {
    return toActionError(e);
  }
}

export async function creditAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  const deps = await invoicingDeps();
  const reason = String(fd.get('reason') ?? '').trim();
  if (reason.length < 3) return { error: 'Indica o motivo da anulação.' };
  let ncId: string;
  try {
    ncId = (await withTenant(getDb(), ctx, (tx) => creditInvoice(tx, deps, ctx, id, reason))).creditNoteId;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/app/faturas');
  redirect(`/app/faturas/${ncId}`);
}

export async function toggleRemindersAction(id: string, enabled: boolean) {
  const ctx = await requireAccount();
  await withTenant(getDb(), ctx, (tx) => tx.update(invoices).set({ remindersEnabled: enabled }).where(and(eq(invoices.id, id), eq(invoices.accountId, ctx.accountId))));
  revalidatePath(`/app/faturas/${id}`);
}

export async function saveQuoteAction(input: DocumentInput, id?: string): Promise<ActionState | void> {
  const ctx = await requireAccount();
  const deps = await invoicingDeps();
  let saved: string;
  try {
    saved = (await withTenant(getDb(), ctx, (tx) => saveQuote(tx, ctx, input, deps.params, id))).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/app/faturas');
  redirect(`/app/faturas/orcamentos/${saved}`);
}

export async function quoteAction(id: string, action: 'accept' | 'reject' | 'pdf' | 'convert'): Promise<ActionState | void> {
  const ctx = await requireAccount();
  const deps = await invoicingDeps();
  let target: string | undefined;
  try {
    await withTenant(getDb(), ctx, async (tx) => {
      if (action === 'accept' || action === 'reject') await setQuoteStatus(tx, ctx, id, action === 'accept' ? 'accepted' : 'rejected');
      if (action === 'pdf') await renderQuotePdf(tx, deps.storage, ctx, id, deps.params);
      if (action === 'convert') target = await convertQuoteToInvoice(tx, ctx, id, deps.params, deps.today);
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/app/faturas/orcamentos/${id}`);
  if (target) redirect(`/app/faturas/${target}`);
}

export async function sendQuoteAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  const deps = await invoicingDeps();
  try {
    await withTenant(getDb(), ctx, (tx) => sendQuoteEmail(tx, deps, ctx, id, { to: String(fd.get('to') ?? '') || undefined, message: String(fd.get('message') ?? '') || undefined }));
    revalidatePath(`/app/faturas/orcamentos/${id}`);
    return { ok: true, message: 'Orçamento enviado.' };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveClientAction(id: string | undefined, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  const input: ClientInput = {
    name: String(fd.get('name') ?? ''),
    nif: String(fd.get('nif') ?? ''),
    email: String(fd.get('email') ?? ''),
    addressLine: String(fd.get('addressLine') ?? ''),
    postalCode: String(fd.get('postalCode') ?? ''),
    city: String(fd.get('city') ?? ''),
    country: String(fd.get('country') ?? 'PT') || 'PT',
    isCompany: fd.get('isCompany') === 'on',
    hasOrganizedAccounting: fd.get('hasOrganizedAccounting') === 'on',
    paymentTermsDays: Number(fd.get('paymentTermsDays') ?? 30) || 0,
  };
  try {
    await withTenant(getDb(), ctx, (tx) => saveClient(tx, ctx, input, id));
    revalidatePath('/app/faturas/clientes');
    return { ok: true, message: 'Cliente guardado.' };
  } catch (e) {
    return toActionError(e);
  }
}
