'use client';

import { useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Briefcase, Building2, Check, Store, Users } from 'lucide-react';
import type { AccountProfileInput } from '@somar/core';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { DISCLAIMER } from '@/components/disclaimer';
import { cn } from '@/lib/utils';
import { createAccountAction } from './actions';

type LegalForm = AccountProfileInput['legalForm'];
type Form = {
  legalForm?: LegalForm;
  name: string;
  nif: string;
  activityStartDate: string;
  cae: string;
  cirsActivityCode: string;
  mainIncomeType: string;
  hasEmploymentIncome: boolean;
  taxRegion: 'continente' | 'madeira' | 'acores';
  vatRegime: string;
  incomeTaxRegime: string;
};

const LEGAL_FORMS: { value: LegalForm; title: string; text: string; icon: typeof Briefcase }[] = [
  {
    value: 'trabalhador_independente',
    title: 'Trabalhador independente',
    text: 'Passas recibos verdes em teu nome. Ex.: designer, programador, consultor, terapeuta.',
    icon: Briefcase,
  },
  {
    value: 'eni',
    title: 'Empresário em nome individual',
    text: 'Tens um negócio em teu nome: loja, oficina, obras, venda de produtos.',
    icon: Store,
  },
  {
    value: 'unipessoal_lda',
    title: 'Sociedade unipessoal',
    text: 'Uma empresa (Unipessoal Lda.) com um único sócio.',
    icon: Building2,
  },
  { value: 'lda', title: 'Sociedade por quotas', text: 'Uma empresa (Lda.) com dois ou mais sócios.', icon: Users },
];

const INCOME_TYPES = [
  { value: 'servicos_tabela_151', label: 'Profissão da tabela do art. 151.º do CIRS (ex.: arquiteto, designer, consultor, programador)' },
  { value: 'servicos_outros', label: 'Outros serviços' },
  { value: 'vendas', label: 'Venda de produtos ou mercadorias' },
  { value: 'hotelaria_restauracao', label: 'Restauração, bebidas ou alojamento' },
  { value: 'propriedade_intelectual', label: 'Direitos de autor ou propriedade intelectual' },
];

const VAT_OPTIONS = [
  {
    value: 'isento_art53',
    title: 'Isento (art. 53.º)',
    text: 'Faturas sem IVA. Para quem fatura pouco (até ao limite anual previsto na lei) e não tem contabilidade organizada.',
    individualOnly: true,
  },
  { value: 'normal_trimestral', title: 'Normal trimestral', text: 'Cobras IVA e entregas a declaração a cada 3 meses. É o mais comum.' },
  { value: 'normal_mensal', title: 'Normal mensal', text: 'Declaração todos os meses. Obrigatório a partir de 650 000 € de volume de negócios anual.' },
  { value: 'isento_art9', title: 'Isento (art. 9.º)', text: 'Atividades isentas por natureza, como saúde ou ensino. Não cobras IVA nem o deduzes.' },
];

const STEPS = ['Estatuto', 'Atividade', 'Regimes', 'Confirmar'];

const isIndividual = (lf?: LegalForm) => lf === 'trabalhador_independente' || lf === 'eni';

export function OnboardingWizard({ firstName }: { firstName: string }) {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [accepted, setAccepted] = useState(false);
  const [form, setForm] = useState<Form>({
    name: '',
    nif: '',
    activityStartDate: '',
    cae: '',
    cirsActivityCode: '',
    mainIncomeType: 'servicos_tabela_151',
    hasEmploymentIncome: false,
    taxRegion: 'continente',
    vatRegime: '',
    incomeTaxRegime: '',
  });
  const individual = isIndividual(form.legalForm);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function chooseLegalForm(lf: LegalForm) {
    const ind = isIndividual(lf);
    setForm((f) => ({
      ...f,
      legalForm: lf,
      incomeTaxRegime: ind ? 'irs_simplificado' : 'irc_geral',
      vatRegime: f.vatRegime && !(f.vatRegime === 'isento_art53' && !ind) ? f.vatRegime : ind ? 'isento_art53' : 'normal_trimestral',
    }));
    setStep(1);
  }

  const canNext =
    (step === 0 && !!form.legalForm) ||
    (step === 1 && form.name.trim().length >= 2 && !!form.activityStartDate) ||
    (step === 2 && !!form.vatRegime && !!form.incomeTaxRegime) ||
    step === 3;

  function submit() {
    setError(undefined);
    const payload: AccountProfileInput = {
      name: form.name,
      legalForm: form.legalForm!,
      nif: form.nif || undefined,
      vatRegime: form.vatRegime as AccountProfileInput['vatRegime'],
      incomeTaxRegime: form.incomeTaxRegime as AccountProfileInput['incomeTaxRegime'],
      taxRegion: form.taxRegion,
      activityStartDate: form.activityStartDate,
      cae: form.cae || undefined,
      cirsActivityCode: individual && form.mainIncomeType === 'servicos_tabela_151' ? form.cirsActivityCode || undefined : undefined,
      mainIncomeType: individual ? (form.mainIncomeType as AccountProfileInput['mainIncomeType']) : undefined,
      hasEmploymentIncome: individual ? form.hasEmploymentIncome : false,
    };
    startTransition(async () => {
      const res = await createAccountAction(payload);
      if (res?.error) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        const fe = Object.keys(res.fieldErrors ?? {});
        if (fe.some((k) => ['name', 'nif', 'activityStartDate', 'cae', 'cirsActivityCode', 'mainIncomeType'].includes(k))) setStep(1);
        else if (fe.some((k) => ['vatRegime', 'incomeTaxRegime'].includes(k))) setStep(2);
      }
    });
  }

  return (
    <div className="grid gap-10">
      <ol className="flex items-center gap-2 text-sm" aria-label="Passos">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                i < step && 'border-primary bg-primary text-primary-foreground',
                i === step && 'border-primary text-primary',
                i > step && 'text-muted-foreground',
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('hidden sm:inline', i === step ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="grid gap-6">
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Olá{firstName ? `, ${firstName}` : ''}! Como trabalhas?</h1>
            <p className="text-muted-foreground">Isto define os impostos e os prazos que vamos acompanhar por ti.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {LEGAL_FORMS.map(({ value, title, text, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => chooseLegalForm(value)}
                aria-pressed={form.legalForm === value}
                className={cn(
                  'grid gap-2 rounded-2xl border bg-card p-5 text-left transition hover:border-primary/50 hover:shadow-sm focus-visible:ring-4 focus-visible:ring-ring',
                  form.legalForm === value && 'border-primary ring-1 ring-primary',
                )}
              >
                <Icon className="size-5 text-primary" />
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{text}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="grid gap-6">
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">A tua atividade</h1>
            <p className="text-muted-foreground">Encontras estes dados na declaração de início de atividade, no Portal das Finanças.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={individual ? 'Nome da atividade' : 'Denominação social'} htmlFor="name" error={fieldErrors.name} className="sm:col-span-2">
              <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={individual ? 'Ex.: Joana Silva Design' : 'Ex.: Oficina Norte, Lda.'} />
            </Field>
            <Field label={individual ? 'NIF' : 'NIPC'} htmlFor="nif" error={fieldErrors.nif} hint="Opcional agora, necessário para faturar.">
              <Input id="nif" inputMode="numeric" maxLength={9} value={form.nif} onChange={(e) => set('nif', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Data de início de atividade" htmlFor="start" error={fieldErrors.activityStartDate}>
              <Input id="start" type="date" value={form.activityStartDate} onChange={(e) => set('activityStartDate', e.target.value)} />
            </Field>
            {individual && (
              <Field label="O que fazes principalmente?" htmlFor="incomeType" error={fieldErrors.mainIncomeType} className="sm:col-span-2">
                <Select id="incomeType" value={form.mainIncomeType} onChange={(e) => set('mainIncomeType', e.target.value)}>
                  {INCOME_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {individual && form.mainIncomeType === 'servicos_tabela_151' && (
              <Field label="Código da atividade (art. 151.º)" htmlFor="cirs" error={fieldErrors.cirsActivityCode} hint="4 dígitos, ex.: 1332 (designers). Opcional.">
                <Input id="cirs" inputMode="numeric" maxLength={4} value={form.cirsActivityCode} onChange={(e) => set('cirsActivityCode', e.target.value.replace(/\D/g, ''))} />
              </Field>
            )}
            <Field label="CAE principal" htmlFor="cae" error={fieldErrors.cae} hint="5 dígitos. Opcional.">
              <Input id="cae" inputMode="numeric" maxLength={5} value={form.cae} onChange={(e) => set('cae', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Onde tens a sede/domicílio fiscal?" htmlFor="region">
              <Select id="region" value={form.taxRegion} onChange={(e) => set('taxRegion', e.target.value as Form['taxRegion'])}>
                <option value="continente">Portugal continental</option>
                <option value="madeira">Região Autónoma da Madeira</option>
                <option value="acores">Região Autónoma dos Açores</option>
              </Select>
            </Field>
            {individual && (
              <label className="flex items-start gap-3 text-sm sm:col-span-2">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={form.hasEmploymentIncome} onChange={(e) => set('hasEmploymentIncome', e.target.checked)} />
                <span>Também trabalho por conta de outrem (tenho recibo de vencimento).</span>
              </label>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="grid gap-8">
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Os teus regimes</h1>
            <p className="text-muted-foreground">Escolhe o que consta da tua declaração de atividade. Podes mudar depois.</p>
          </div>
          <fieldset className="grid gap-3">
            <legend className="mb-3 font-medium">IVA</legend>
            {VAT_OPTIONS.filter((o) => individual || !o.individualOnly).map((o) => (
              <label key={o.value} className={cn('flex cursor-pointer gap-3 rounded-2xl border bg-card p-4', form.vatRegime === o.value && 'border-primary ring-1 ring-primary')}>
                <input type="radio" name="vat" className="mt-1 size-4 accent-[var(--primary)]" checked={form.vatRegime === o.value} onChange={() => set('vatRegime', o.value)} />
                <span className="grid gap-1">
                  <span className="font-medium">{o.title}</span>
                  <span className="text-sm text-muted-foreground">{o.text}</span>
                </span>
              </label>
            ))}
            {fieldErrors.vatRegime && <p className="text-sm text-destructive">{fieldErrors.vatRegime}</p>}
          </fieldset>
          {individual ? (
            <fieldset className="grid gap-3">
              <legend className="mb-3 font-medium">IRS</legend>
              {[
                { value: 'irs_simplificado', title: 'Regime simplificado', text: 'O imposto é calculado sobre uma parte do que faturas (coeficiente). O mais comum até 200 000 € por ano.' },
                { value: 'irs_contabilidade_organizada', title: 'Contabilidade organizada', text: 'O imposto incide sobre o lucro real (receitas menos despesas). Exige um contabilista certificado.' },
              ].map((o) => (
                <label key={o.value} className={cn('flex cursor-pointer gap-3 rounded-2xl border bg-card p-4', form.incomeTaxRegime === o.value && 'border-primary ring-1 ring-primary')}>
                  <input type="radio" name="irs" className="mt-1 size-4 accent-[var(--primary)]" checked={form.incomeTaxRegime === o.value} onChange={() => set('incomeTaxRegime', o.value)} />
                  <span className="grid gap-1">
                    <span className="font-medium">{o.title}</span>
                    <span className="text-sm text-muted-foreground">{o.text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <Alert variant="info">As sociedades são tributadas em IRC e têm sempre contabilidade organizada, com um contabilista certificado responsável.</Alert>
          )}
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-6">
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Está tudo certo?</h1>
            <p className="text-muted-foreground">Confirma os dados. Vamos preparar o teu calendário fiscal a partir daqui.</p>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-2xl border bg-border">
            {[
              ['Estatuto', LEGAL_FORMS.find((l) => l.value === form.legalForm)?.title],
              ['Nome', form.name],
              [individual ? 'NIF' : 'NIPC', form.nif || 'Por indicar'],
              ['Início de atividade', form.activityStartDate],
              ['IVA', VAT_OPTIONS.find((v) => v.value === form.vatRegime)?.title],
              ['Imposto sobre o rendimento', { irs_simplificado: 'IRS — regime simplificado', irs_contabilidade_organizada: 'IRS — contabilidade organizada', irc_geral: 'IRC' }[form.incomeTaxRegime]],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 bg-card px-5 py-3.5 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <label className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>{DISCLAIMER}</span>
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      )}

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft /> Voltar
          </Button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          step > 0 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Continuar <ArrowRight />
            </Button>
          )
        ) : (
          <Button onClick={submit} disabled={!accepted || pending} size="lg">
            {pending ? 'A criar…' : 'Criar a minha conta'}
          </Button>
        )}
      </div>
    </div>
  );
}
