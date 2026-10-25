import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import {
  accounts,
  categories,
  clients,
  declarations,
  documentLines,
  invoices,
  memberships,
  notifications,
  taxObligations,
  transactions,
  users,
  type TenantTx,
} from '@somar/db';
import { ENGINE_VERSION, computeSocialSecurity, quarterOf } from '@somar/tax-engine';
import { buildYearData } from '../accounting';
import { audit } from '../audit';
import { AppError } from '../errors';
import { formatEurPlain } from '../format';
import type { Mailer } from '../invoicing/mailer';
import { OBLIGATION_LABELS, type LoadedParams } from '../tax';
import {
  buildCompanyAnnualSupport,
  buildIrsDeclaration,
  buildSaftInvoicing,
  buildSsDeclaration,
  buildVatDeclaration,
  type DeclarationData,
  type SaftInvoice,
} from './builders';

type Ctx = { accountId: string; userId?: string | null };

const DECLARATIVE = new Set(['iva_declaracao_periodica', 'irs_modelo3', 'ss_declaracao_trimestral', 'ies', 'irc_modelo22', 'efatura_comunicacao', 'saft_faturacao']);

export const isDeclarative = (type: string) => DECLARATIVE.has(type);

async function invoicesOf(tx: TenantTx, accountId: string, from: string, to: string) {
  return tx
    .select({ inv: invoices, client: clients })
    .from(invoices)
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.accountId, accountId), inArray(invoices.status, ['issued', 'sent', 'partially_paid', 'paid', 'cancelled']), gte(invoices.issueDate, from), lte(invoices.issueDate, to)));
}

/**
 * Prepara (ou atualiza) a declaração de uma obrigação: calcula os valores com o motor fiscal a partir
 * da contabilidade e gera os ficheiros de apoio. Fica "por rever" até o utilizador confirmar.
 */
export async function prepareDeclaration(tx: TenantTx, ctx: Ctx, obligationId: string, loaded: LoadedParams) {
  const [o] = await tx.select().from(taxObligations).where(and(eq(taxObligations.id, obligationId), eq(taxObligations.accountId, ctx.accountId)));
  if (!o) throw new AppError('not_found', 'Obrigação não encontrada.', 404);
  const [account] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
  if (!account) throw new AppError('not_found', 'Conta não encontrada.', 404);
  const year = Number(o.periodStart.slice(0, 4));
  let data: DeclarationData | null = null;
  let amount: number | null = null;

  switch (o.type) {
    case 'iva_declaracao_periodica':
    case 'iva_pagamento': {
      const yd = await buildYearData(tx, ctx.accountId, year, loaded);
      const period = yd.vat.find((p) => p.period.start === o.periodStart && p.period.end === o.periodEnd);
      if (!period) throw new AppError('not_applicable', 'Sem apuramento de IVA para este período.');
      amount = period.payableCents;
      if (o.type === 'iva_declaracao_periodica') {
        data = buildVatDeclaration({ nif: account.nif, periodLabel: o.periodLabel, periodicity: account.vatRegime === 'normal_mensal' ? 'mensal' : 'trimestral', result: period });
      }
      break;
    }
    case 'irs_modelo3': {
      const yd = await buildYearData(tx, ctx.accountId, year, loaded);
      if (!yd.irs) throw new AppError('not_applicable', 'Esta conta não é tributada em IRS.');
      const rows = await invoicesOf(tx, ctx.accountId, `${year}-01-01`, `${year}-12-31`);
      const byClient = new Map<string, { nif: string; name: string; incomeCents: number; withholdingCents: number }>();
      for (const { inv, client } of rows) {
        if (inv.status === 'cancelled') continue;
        const sign = inv.docType === 'NC' ? -1 : 1;
        const nif = client?.nif ?? '999999990';
        const cur = byClient.get(nif) ?? { nif, name: client?.name ?? 'Consumidor final', incomeCents: 0, withholdingCents: 0 };
        cur.incomeCents += sign * inv.netCents;
        cur.withholdingCents += sign * inv.withholdingCents;
        byClient.set(nif, cur);
      }
      const list = [...byClient.values()].sort((a, b) => b.incomeCents - a.incomeCents);
      data = buildIrsDeclaration({
        year,
        nif: account.nif,
        cirsActivityCode: account.cirsActivityCode,
        cae: account.cae,
        irs: yd.irs,
        withholdings: list.filter((c) => c.withholdingCents > 0).map((c) => ({ payerNif: c.nif, payerName: c.name, incomeCents: c.incomeCents, withholdingCents: c.withholdingCents })),
        justification: { efaturaCents: yd.summary.efaturaExpensesCents, socialSecurityCents: yd.summary.socialSecurityPaidCents },
        clientsIncome: list.map((c) => ({ nif: c.nif, name: c.name, incomeCents: c.incomeCents })),
      });
      amount = Math.max(0, yd.irs.resultCents);
      break;
    }
    case 'ss_declaracao_trimestral':
    case 'ss_pagamento_contribuicoes': {
      const q = quarterOf(Number(o.periodStart.slice(5, 7)));
      const rows = await invoicesOf(tx, ctx.accountId, `${year - 1}-10-01`, o.periodEnd);
      const incomeType = account.mainIncomeType ?? 'servicos_tabela_151';
      const byQuarter = new Map<string, number>();
      for (const { inv } of rows) {
        if (inv.status === 'cancelled') continue;
        const k = `${inv.issueDate.slice(0, 4)}-${quarterOf(Number(inv.issueDate.slice(5, 7)))}`;
        byQuarter.set(k, (byQuarter.get(k) ?? 0) + (inv.docType === 'NC' ? -1 : 1) * inv.netCents);
      }
      if (o.type === 'ss_declaracao_trimestral') {
        const income = byQuarter.get(`${year}-${q}`) ?? 0;
        const ss = computeSocialSecurity({ legalForm: account.legalForm, activityStartDate: account.activityStartDate, quarters: [{ year, quarter: q as 1, byType: { [incomeType]: income } }] }, loaded.resolve);
        const sales = incomeType === 'vendas' || incomeType === 'hotelaria_restauracao';
        data = buildSsDeclaration({ year, quarter: q, servicesCents: sales ? 0 : income, salesCents: sales ? income : 0, result: ss.quarters[0] });
        amount = ss.quarters[0]!.monthlyContributionCents;
      } else {
        // Contribuição do mês: a base vem do trimestre anterior
        const [py, pq] = q === 1 ? [year - 1, 4] : [year, q - 1];
        const ss = computeSocialSecurity({ legalForm: account.legalForm, activityStartDate: account.activityStartDate, quarters: [{ year: py, quarter: pq as 1, byType: { [incomeType]: byQuarter.get(`${py}-${pq}`) ?? 0 } }] }, loaded.resolve);
        amount = ss.quarters[0]!.months.find((m) => m.month === o.periodStart.slice(0, 7))?.contributionCents ?? null;
      }
      break;
    }
    case 'ies':
    case 'irc_modelo22': {
      const yd = await buildYearData(tx, ctx.accountId, year, loaded);
      const exp = await tx
        .select({ snc: categories.sncAccount, name: categories.name, amount: transactions.amountCents })
        .from(transactions)
        .innerJoin(categories, eq(categories.id, transactions.categoryId))
        .where(and(eq(transactions.accountId, ctx.accountId), eq(categories.kind, 'expense'), gte(transactions.bookingDate, `${year}-01-01`), lte(transactions.bookingDate, `${year}-12-31`)));
      const bySnc = new Map<string, { account: string; label: string; cents: number }>();
      for (const e of exp) {
        const k = e.snc ?? '68';
        const cur = bySnc.get(k) ?? { account: k, label: e.name, cents: 0 };
        cur.cents += -e.amount;
        bySnc.set(k, cur);
      }
      data = buildCompanyAnnualSupport({ year, nif: account.nif, incomeCents: yd.summary.incomeNetCents, expensesBySnc: [...bySnc.values()].sort((a, b) => a.account.localeCompare(b.account)), irc: yd.irc });
      amount = yd.irc?.totalCents ?? null;
      break;
    }
    case 'efatura_comunicacao':
    case 'saft_faturacao': {
      const rows = await invoicesOf(tx, ctx.accountId, o.periodStart, o.periodEnd);
      const ids = rows.map((r) => r.inv.id);
      const lines = ids.length ? await tx.select().from(documentLines).where(inArray(documentLines.invoiceId, ids)) : [];
      const docs: SaftInvoice[] = rows.map(({ inv, client }) => ({
        number: inv.number ?? '',
        atcud: inv.atcud ?? '',
        docType: inv.docType,
        issueDate: inv.issueDate,
        status: inv.status,
        hash: inv.documentHash ?? '0',
        customer: { id: client?.id ?? 'CF', nif: client?.nif ?? '999999990', name: client?.name ?? 'Consumidor final', address: client?.addressLine, postalCode: client?.postalCode, city: client?.city, country: client?.country ?? 'PT' },
        lines: lines.filter((l) => l.invoiceId === inv.id).sort((a, b) => a.position - b.position).map((l) => ({ position: l.position, description: l.description, quantity: l.quantity, unitPriceCents: l.unitPriceCents, netCents: l.netCents, vatRatePct: l.vatRatePct, vatExemptionCode: l.vatExemptionCode, vatRateCode: l.vatRateCode })),
        netCents: inv.netCents,
        vatCents: inv.vatCents,
        totalCents: inv.totalCents,
        withholdingCents: inv.withholdingCents,
      }));
      const xml = buildSaftInvoicing({
        company: { nif: account.nif ?? '', name: account.name, address: account.addressLine ?? '', postalCode: account.postalCode ?? '', city: account.city ?? '' },
        period: { start: o.periodStart, end: o.periodEnd },
        invoices: docs,
        software: { certificate: '0', producerNif: '999999990', name: 'Somar/Somar', version: ENGINE_VERSION },
      });
      data = {
        type: o.type,
        title: `SAF-T de faturação — ${o.periodLabel}`,
        periodLabel: o.periodLabel,
        portal: { name: 'e-fatura (Portal das Finanças)', url: 'https://faturas.portaldasfinancas.gov.pt' },
        summary: [
          { label: 'Documentos', valueCents: docs.length * 100 },
          { label: 'Total sem IVA', valueCents: docs.reduce((s, d) => s + (d.docType === 'NC' ? -d.netCents : d.netCents), 0), emphasis: true },
        ],
        sections: [{ title: 'Documentos do mês', fields: docs.map((d) => ({ code: d.number, label: `${d.customer.name} (${d.issueDate.split('-').reverse().join('/')})`, valueCents: d.totalCents })) }],
        steps: [
          'As faturas emitidas pelo software certificado são comunicadas automaticamente à AT.',
          'Confirma no e-fatura (faturas.portaldasfinancas.gov.pt → Emitentes) que todos os documentos do mês aparecem.',
          'Se faltar algum, o ficheiro SAF-T em anexo pode ser entregue em "Comunicação de faturas → Enviar ficheiro SAF-T" (validar primeiro).',
        ],
        warnings: ['Ficheiro gerado para conferência; não foi validado contra o XSD oficial.'],
        files: [{ name: `saft-${o.periodStart.slice(0, 7)}.xml`, mimeType: 'application/xml', content: xml }],
      };
      break;
    }
    default:
      break;
  }

  if (amount != null) await tx.update(taxObligations).set({ amountEstimateCents: amount }).where(eq(taxObligations.id, o.id));
  if (!data) return { declarationId: null, amountCents: amount };

  const values = {
    accountId: ctx.accountId,
    obligationId: o.id,
    type: o.type,
    periodStart: o.periodStart,
    periodEnd: o.periodEnd,
    status: 'ready_for_review' as const,
    data: data as unknown as Record<string, unknown>,
    engineVersion: ENGINE_VERSION,
    paramSetId: loaded.setIdFor(year) ?? null,
    confirmedBy: null,
    confirmedAt: null,
  };
  let declarationId = o.declarationId;
  if (declarationId) {
    const [existing] = await tx.select({ status: declarations.status }).from(declarations).where(eq(declarations.id, declarationId));
    if (existing?.status === 'submitted') return { declarationId, amountCents: amount }; // não altera declarações entregues
    await tx.update(declarations).set(values).where(eq(declarations.id, declarationId));
  } else {
    const [row] = await tx.insert(declarations).values(values).returning({ id: declarations.id });
    declarationId = row!.id;
  }
  await tx.update(taxObligations).set({ declarationId, status: o.status === 'upcoming' ? 'ready' : o.status }).where(eq(taxObligations.id, o.id));
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, actorType: ctx.userId ? 'user' : 'system', action: 'declaration.prepared', entityType: 'declaration', entityId: declarationId! });
  return { declarationId: declarationId!, amountCents: amount };
}

/** O utilizador (ou o contabilista) revê e confirma os valores. Só depois a app marca como "pronta a submeter". */
export async function confirmDeclaration(tx: TenantTx, ctx: { accountId: string; userId: string }, declarationId: string) {
  const [d] = await tx
    .update(declarations)
    .set({ status: 'confirmed', confirmedBy: ctx.userId, confirmedAt: new Date() })
    .where(and(eq(declarations.id, declarationId), eq(declarations.accountId, ctx.accountId), inArray(declarations.status, ['draft', 'ready_for_review'])))
    .returning();
  if (!d) throw new AppError('invalid_state', 'Esta declaração não pode ser confirmada.');
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'declaration.confirmed', entityType: 'declaration', entityId: declarationId });
  return d;
}

/** Registo da submissão feita pelo utilizador no portal oficial (a app nunca submete sozinha). */
export async function markDeclarationSubmitted(tx: TenantTx, ctx: { accountId: string; userId: string }, declarationId: string, submissionRef?: string) {
  const [d] = await tx
    .update(declarations)
    .set({ status: 'submitted', submittedAt: new Date(), submissionRef: submissionRef?.slice(0, 100) || null })
    .where(and(eq(declarations.id, declarationId), eq(declarations.accountId, ctx.accountId), eq(declarations.status, 'confirmed')))
    .returning();
  if (!d) throw new AppError('invalid_state', 'Confirma os valores antes de marcar como submetida.');
  if (d.obligationId) await tx.update(taxObligations).set({ status: 'submitted', completedAt: new Date() }).where(eq(taxObligations.id, d.obligationId));
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'declaration.submitted', entityType: 'declaration', entityId: declarationId, data: { submissionRef } });
  return d;
}

// ---------------------------------------------------------------------------
// Notificações de prazos
// ---------------------------------------------------------------------------

export const NOTIFY_OFFSETS = [10, 3, 0, -1] as const;

/**
 * Cria notificações (e envia emails) para os prazos: 10 e 3 dias antes, no dia e no dia seguinte
 * (em atraso). Para obrigações declarativas, prepara o rascunho da declaração com antecedência.
 * Idempotente por obrigação e estágio.
 */
export async function notifyObligations(tx: TenantTx, deps: { mailer?: Mailer; loaded: LoadedParams; appUrl?: string }, accountId: string, today: string) {
  const horizon = new Date(Date.parse(today) + 10 * 86_400_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  const rows = await tx
    .select()
    .from(taxObligations)
    .where(and(eq(taxObligations.accountId, accountId), inArray(taxObligations.status, ['upcoming', 'in_preparation', 'ready']), gte(taxObligations.dueDate, yesterday), lte(taxObligations.dueDate, horizon)));
  const recipients = await tx
    .select({ id: users.id, email: users.email, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.accountId, accountId), inArray(memberships.role, ['owner', 'admin'])));
  let created = 0;
  for (const o of rows) {
    const days = Math.round((Date.parse(o.dueDate) - Date.parse(today)) / 86_400_000);
    const stage = NOTIFY_OFFSETS.find((s) => s === days);
    if (stage === undefined) continue;
    let amount = o.amountEstimateCents;
    if (stage === 10 || o.declarationId == null) {
      try {
        const r = await prepareDeclaration(tx, { accountId }, o.id, deps.loaded);
        amount = r.amountCents ?? amount;
      } catch {
        // sem dados suficientes: a notificação segue na mesma
      }
    }
    const label = OBLIGATION_LABELS[o.type] ?? o.type;
    const when = days === 0 ? 'termina hoje' : days < 0 ? 'terminou ontem' : `termina daqui a ${days} dias`;
    const title = `${label} (${o.periodLabel}) ${when}`;
    const body = `Prazo: ${o.dueDate.split('-').reverse().join('/')}.${amount ? ` Valor estimado: ${formatEurPlain(amount)}.` : ''} ${isDeclarative(o.type) ? 'Os valores estão preparados para reveres.' : ''}`.trim();
    const link = o.declarationId ? `/app/impostos/declaracoes/${o.declarationId}` : '/app/impostos';
    const inserted = await tx
      .insert(notifications)
      .values({ accountId, type: days < 0 ? 'obligation_overdue' : 'obligation_due', title, body, link, dedupeKey: `obligation:${o.id}:${stage}` })
      .onConflictDoNothing({ target: [notifications.accountId, notifications.dedupeKey] })
      .returning({ id: notifications.id });
    if (!inserted.length) continue;
    created++;
    await tx.update(taxObligations).set({ lastNotifiedAt: new Date() }).where(eq(taxObligations.id, o.id));
    if (deps.mailer && (stage === 10 || stage === 0 || stage === -1)) {
      for (const r of recipients) {
        await deps.mailer.send({ to: r.email, subject: `Somar: ${title}`, text: `Olá ${r.name.split(' ')[0]},\n\n${body}\n\n${deps.appUrl ?? ''}${link}\n\nO Somar prepara os valores; a submissão é feita por ti no portal oficial.` });
      }
      await tx.update(notifications).set({ emailedAt: new Date() }).where(eq(notifications.id, inserted[0]!.id));
    }
  }
  return created;
}
