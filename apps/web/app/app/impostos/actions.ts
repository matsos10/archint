'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { declarations, taxObligations, withTenant } from '@somar/db';
import { audit, computeSavings, confirmDeclaration, explainWithAi, loadTaxParams, markDeclarationSubmitted, prepareDeclaration, type DeclarationData } from '@somar/core';
import { accountLlm } from '@/lib/ai';
import { toActionError, type ActionState } from '@/lib/action';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';

const ALLOWED = new Set(['upcoming', 'submitted', 'paid']);

/** O utilizador confirma que cumpriu (ou desfaz) uma obrigação. A app nunca submete nada sozinha. */
export async function setObligationStatus(id: string, status: string) {
  const ctx = await requireAccount();
  if (!ALLOWED.has(status)) return { error: 'Estado inválido.' };
  await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [row] = await tx
      .update(taxObligations)
      .set({ status: status as 'upcoming', completedAt: status === 'upcoming' ? null : new Date() })
      .where(and(eq(taxObligations.id, id), eq(taxObligations.accountId, ctx.accountId)))
      .returning({ id: taxObligations.id, type: taxObligations.type });
    if (row) {
      await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'obligation.status_changed', entityType: 'tax_obligation', entityId: id, data: { status } });
    }
  });
  revalidatePath('/app/impostos');
  return { ok: true };
}

export async function prepareDeclarationAction(obligationId: string) {
  const ctx = await requireAccount();
  const loaded = await loadTaxParams(getDb());
  let id: string | null = null;
  try {
    id = (await withTenant(getDb(), ctx.accountId, (tx) => prepareDeclaration(tx, ctx, obligationId, loaded))).declarationId;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/app/impostos');
  if (id) redirect(`/app/impostos/declaracoes/${id}`);
  return { ok: true };
}

export async function confirmDeclarationAction(id: string) {
  const ctx = await requireAccount();
  try {
    await withTenant(getDb(), ctx.accountId, (tx) => confirmDeclaration(tx, ctx, id));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/app/impostos/declaracoes/${id}`);
  return { ok: true };
}

export async function submittedDeclarationAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  try {
    await withTenant(getDb(), ctx.accountId, (tx) => markDeclarationSubmitted(tx, ctx, id, String(fd.get('ref') ?? '')));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/app/impostos/declaracoes/${id}`);
  revalidatePath('/app/impostos');
  return { ok: true, message: 'Registada como submetida.' };
}

export async function explainDeclarationAction(id: string) {
  const ctx = await requireAccount();
  return withTenant(getDb(), ctx.accountId, async (tx) => {
    const [d] = await tx.select().from(declarations).where(and(eq(declarations.id, id), eq(declarations.accountId, ctx.accountId)));
    if (!d) return null;
    const data = d.data as unknown as DeclarationData;
    const facts = [
      ...data.summary.map((s) => ({ label: s.label, amountCents: s.valueCents })),
      ...data.sections.flatMap((sec) => sec.fields.filter((f) => f.valueCents).slice(0, 8).map((f) => ({ label: `${sec.title} — ${f.label}`, amountCents: f.valueCents }))),
    ];
    return explainWithAi(tx, ctx, await accountLlm(tx, ctx.accountId), { title: data.title, question: `Explica, em linguagem simples, de onde vêm os valores de: ${data.title}.`, facts });
  });
}

export async function aiSavingsAction() {
  const ctx = await requireAccount();
  const loaded = await loadTaxParams(getDb());
  return withTenant(getDb(), ctx.accountId, async (tx) => computeSavings(tx, ctx, { llm: await accountLlm(tx, ctx.accountId), loaded }));
}
