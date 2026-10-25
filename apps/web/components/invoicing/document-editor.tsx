'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { computeInvoice, VAT_EXEMPTION_REASONS, type InvoiceContext, type TaxParams, type VatRateCode } from '@somar/tax-engine';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { formatEur } from '@/lib/utils';

export interface EditorClient {
  id: string;
  name: string;
  isCompany: boolean;
  hasOrganizedAccounting: boolean;
  paymentTermsDays: number;
}

export interface EditorLine {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  vatRateCode: VatRateCode;
  vatExemptionCode: string;
}

export interface EditorValue {
  clientId: string;
  docType: 'FT' | 'FR' | 'FS';
  issueDate: string;
  dueDate: string;
  validUntil: string;
  notes: string;
  withholding: 'auto' | 'on' | 'off';
  lines: EditorLine[];
}

export interface EditorPayload {
  clientId: string | null;
  docType: 'FT' | 'FR' | 'FS';
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  notes: string | undefined;
  applyWithholding: boolean | null;
  lines: { description: string; quantity: number; unitPriceCents: number; discountPct: number; vatRateCode: VatRateCode; vatExemptionCode: string | null }[];
}

const num = (s: string) => Number(String(s).replace(/\s/g, '').replace(',', '.')) || 0;

export function DocumentEditor(props: {
  kind: 'invoice' | 'quote';
  params: TaxParams;
  context: Omit<InvoiceContext, 'clientHasOrganizedAccounting' | 'applyWithholding'>;
  clients: EditorClient[];
  initial: EditorValue;
  onSave: (payload: EditorPayload) => Promise<{ error?: string } | void>;
  submitLabel: string;
}) {
  const [v, setV] = useState<EditorValue>(props.initial);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const client = props.clients.find((c) => c.id === v.clientId);
  const exemptRegime = props.context.vatRegime === 'isento_art53' || props.context.vatRegime === 'isento_art9';

  const payload: EditorPayload = {
    clientId: v.clientId || null,
    docType: v.docType,
    issueDate: v.issueDate,
    dueDate: props.kind === 'invoice' && v.docType === 'FT' ? v.dueDate || null : null,
    validUntil: props.kind === 'quote' ? v.validUntil || null : null,
    notes: v.notes || undefined,
    applyWithholding: v.withholding === 'auto' ? null : v.withholding === 'on',
    lines: v.lines.map((l) => ({
      description: l.description,
      quantity: num(l.quantity),
      unitPriceCents: Math.round(num(l.unitPrice) * 100),
      discountPct: num(l.discountPct),
      vatRateCode: l.vatRateCode,
      vatExemptionCode: l.vatExemptionCode || null,
    })),
  };
  const totals = useMemo(
    () =>
      computeInvoice(
        payload.lines,
        { ...props.context, clientHasOrganizedAccounting: !!client?.isCompany && client.hasOrganizedAccounting, applyWithholding: payload.applyWithholding ?? undefined },
        props.params,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(payload.lines), payload.applyWithholding, client?.id],
  );

  const setLine = (i: number, patch: Partial<EditorLine>) => setV((s) => ({ ...s, lines: s.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }));

  return (
    <form
      className="grid gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        start(async () => {
          const r = await props.onSave(payload);
          if (r && r.error) setError(r.error);
        });
      }}
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Cliente" htmlFor="client" className="sm:col-span-2">
          <Select id="client" value={v.clientId} onChange={(e) => {
            const c = props.clients.find((x) => x.id === e.target.value);
            setV((s) => ({ ...s, clientId: e.target.value, dueDate: c && s.issueDate ? addDays(s.issueDate, c.paymentTermsDays) : s.dueDate }));
          }}>
            <option value="">Consumidor final (sem NIF)</option>
            {props.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {props.kind === 'invoice' && (
          <Field label="Tipo de documento" htmlFor="docType">
            <Select id="docType" value={v.docType} onChange={(e) => setV((s) => ({ ...s, docType: e.target.value as EditorValue['docType'] }))}>
              <option value="FT">Fatura (pagamento posterior)</option>
              <option value="FR">Fatura-recibo (já pago)</option>
              <option value="FS">Fatura simplificada (até 100 €)</option>
            </Select>
          </Field>
        )}
        <Field label="Data" htmlFor="issueDate">
          <Input id="issueDate" type="date" value={v.issueDate} onChange={(e) => setV((s) => ({ ...s, issueDate: e.target.value }))} required />
        </Field>
        {props.kind === 'invoice' && v.docType === 'FT' && (
          <Field label="Vencimento" htmlFor="dueDate">
            <Input id="dueDate" type="date" value={v.dueDate} min={v.issueDate} onChange={(e) => setV((s) => ({ ...s, dueDate: e.target.value }))} />
          </Field>
        )}
        {props.kind === 'quote' && (
          <Field label="Válido até" htmlFor="validUntil">
            <Input id="validUntil" type="date" value={v.validUntil} min={v.issueDate} onChange={(e) => setV((s) => ({ ...s, validUntil: e.target.value }))} />
          </Field>
        )}
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-medium">Linhas</legend>
        {v.lines.map((l, i) => {
          const r = totals.lines[i];
          return (
            <div key={i} className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[1fr_90px_120px_80px_150px_auto] sm:items-end">
              <Field label="Descrição" htmlFor={`d${i}`}>
                <Input id={`d${i}`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} required maxLength={500} />
              </Field>
              <Field label="Qtd." htmlFor={`q${i}`}>
                <Input id={`q${i}`} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              </Field>
              <Field label="Preço (€)" htmlFor={`p${i}`}>
                <Input id={`p${i}`} inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              </Field>
              <Field label="Desc. %" htmlFor={`x${i}`}>
                <Input id={`x${i}`} inputMode="decimal" value={l.discountPct} onChange={(e) => setLine(i, { discountPct: e.target.value })} />
              </Field>
              <Field label="IVA" htmlFor={`v${i}`}>
                <Select id={`v${i}`} value={exemptRegime ? 'isenta' : l.vatRateCode} disabled={exemptRegime} onChange={(e) => setLine(i, { vatRateCode: e.target.value as VatRateCode })}>
                  <option value="normal">Normal ({props.params.vat.rates[props.context.region].normal}%)</option>
                  <option value="intermedia">Intermédia ({props.params.vat.rates[props.context.region].intermedia}%)</option>
                  <option value="reduzida">Reduzida ({props.params.vat.rates[props.context.region].reduzida}%)</option>
                  <option value="isenta">Isento</option>
                </Select>
              </Field>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <span className="text-sm font-medium tabular sm:hidden">{formatEur(r?.netCents ?? 0)}</span>
                <Button type="button" variant="ghost" size="icon" aria-label="Remover linha" disabled={v.lines.length === 1} onClick={() => setV((s) => ({ ...s, lines: s.lines.filter((_, k) => k !== i) }))}>
                  <Trash2 />
                </Button>
              </div>
              {!exemptRegime && l.vatRateCode === 'isenta' && (
                <Field label="Motivo de isenção" htmlFor={`m${i}`} className="sm:col-span-6">
                  <Select id={`m${i}`} value={l.vatExemptionCode} onChange={(e) => setLine(i, { vatExemptionCode: e.target.value })} required>
                    <option value="">Escolher…</option>
                    {Object.entries(VAT_EXEMPTION_REASONS).map(([k, t]) => (
                      <option key={k} value={k}>
                        {k} — {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          );
        })}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setV((s) => ({ ...s, lines: [...s.lines, { description: '', quantity: '1', unitPrice: '', discountPct: '0', vatRateCode: 'normal', vatExemptionCode: '' }] }))}>
            <Plus /> Acrescentar linha
          </Button>
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-[1fr_320px]">
        <div className="grid gap-5">
          {props.context.providerIsIndividual && (
            <Field label="Retenção na fonte de IRS" htmlFor="wh" hint="Automática: aplica-se quando o cliente é uma empresa com contabilidade organizada (art. 101.º CIRS).">
              <Select id="wh" value={v.withholding} onChange={(e) => setV((s) => ({ ...s, withholding: e.target.value as EditorValue['withholding'] }))}>
                <option value="auto">Automática</option>
                <option value="on">Aplicar</option>
                <option value="off">Não aplicar (dispensa)</option>
              </Select>
            </Field>
          )}
          <Field label="Observações" htmlFor="notes">
            <Textarea id="notes" value={v.notes} onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} maxLength={2000} placeholder="Ex.: condições de pagamento" />
          </Field>
        </div>
        <dl className="grid h-fit gap-2 rounded-2xl bg-muted p-5 text-sm" aria-live="polite">
          <div className="flex justify-between"><dt className="text-muted-foreground">Total sem IVA</dt><dd className="tabular">{formatEur(totals.netCents)}</dd></div>
          {totals.byRate.map((g) => (
            <div key={`${g.rateCode}${g.exemptionCode}`} className="flex justify-between">
              <dt className="text-muted-foreground">IVA {g.ratePct}%{g.exemptionCode ? ` (${g.exemptionCode})` : ''}</dt>
              <dd className="tabular">{formatEur(g.vatCents)}</dd>
            </div>
          ))}
          {totals.withholdingCents > 0 && (
            <div className="flex justify-between"><dt className="text-muted-foreground">Retenção IRS ({(totals.withholdingRate * 100).toFixed(1).replace('.', ',')}%)</dt><dd className="tabular">−{formatEur(totals.withholdingCents)}</dd></div>
          )}
          <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold"><dt>{props.kind === 'quote' ? 'Total' : 'A receber'}</dt><dd className="tabular">{formatEur(totals.totalCents)}</dd></div>
        </dl>
      </div>

      {error && <p role="alert" className="rounded-xl bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>{pending ? 'A guardar…' : props.submitLabel}</Button>
      </div>
    </form>
  );
}

function addDays(iso: string, n: number) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
}
