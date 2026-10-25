import { addMonths, dayInMonth, makeDate, monthIndex, monthRange, quarterRange, type IsoDate } from './dates';
import { adjustDeadline } from './holidays';
import { legalRef, type ParamsResolver } from './params';
import { monthName, vatDueDates, vatPeriodsForYear } from './vat';
import { isIndividual, type IncomeTaxRegime, type LegalForm, type VatRegime } from './types';

export type ObligationType =
  | 'iva_declaracao_periodica'
  | 'iva_pagamento'
  | 'irs_modelo3'
  | 'irs_pagamento_por_conta'
  | 'ss_declaracao_trimestral'
  | 'ss_pagamento_contribuicoes'
  | 'efatura_comunicacao'
  | 'saft_faturacao'
  | 'irc_modelo22'
  | 'irc_pagamento_por_conta'
  | 'ies'
  | 'dmr_retencoes'
  | 'ss_declaracao_remuneracoes'
  | 'modelo10';

export interface CalendarProfile {
  legalForm: LegalForm;
  vatRegime: VatRegime;
  incomeTaxRegime: IncomeTaxRegime;
  activityStartDate: IsoDate;
  hasEmployees?: boolean;
  /** Pagamentos por conta de IRS esperados (a AT notifica quando são devidos). */
  irsPaymentsOnAccount?: boolean;
  /** Pagamentos por conta de IRC (por omissão: a partir do 2.º ano de atividade). */
  ircPaymentsOnAccount?: boolean;
  /** A comunicação de faturas é feita automaticamente pelo software certificado (webservice). */
  invoicesAutoCommunicated?: boolean;
}

export interface Obligation {
  type: ObligationType;
  title: string;
  description: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  periodLabel: string;
  windowStart?: IsoDate;
  dueDate: IsoDate;
  legalRef: string;
  /** Obrigação cumprida automaticamente (ex.: comunicação por webservice). */
  automatic?: boolean;
}

const md = (year: number, mmdd: string) => makeDate(year, Number(mmdd.slice(0, 2)), Number(mmdd.slice(3, 5)));
const ORD = ['1.º', '2.º', '3.º'];

/**
 * Calendário de obrigações fiscais e contributivas com prazo no intervalo [from, to], por tipo de conta.
 * Os prazos são transferidos para o dia útil seguinte quando terminam em fim de semana ou feriado nacional.
 */
export function buildObligationCalendar(profile: CalendarProfile, range: { from: IsoDate; to: IsoDate }, resolve: ParamsResolver): Obligation[] {
  const out: Obligation[] = [];
  const fromYear = Number(range.from.slice(0, 4));
  const toYear = Number(range.to.slice(0, 4));
  const start = profile.activityStartDate;
  const individual = isIndividual(profile.legalForm);

  for (let year = fromYear - 1; year <= toYear; year++) {
    let params;
    try {
      params = resolve(year);
    } catch {
      continue; // sem parâmetros para esse ano
    }

    // --- IVA (declaração periódica e pagamento) ---
    for (const p of vatPeriodsForYear(profile.vatRegime, year)) {
      if (p.end < start) continue;
      const due = vatDueDates(p.end, params);
      const ref = legalRef(params, 'vat.deadlines') || 'Arts. 27.º e 41.º CIVA';
      out.push(
        {
          type: 'iva_declaracao_periodica',
          title: `Declaração periódica de IVA — ${p.label}`,
          description: 'Entrega no Portal das Finanças do IVA liquidado e dedutível do período.',
          periodStart: p.start,
          periodEnd: p.end,
          periodLabel: p.label,
          dueDate: due.declaration,
          legalRef: ref,
        },
        {
          type: 'iva_pagamento',
          title: `Pagamento do IVA — ${p.label}`,
          description: 'Pagamento do IVA apurado (só se houver imposto a entregar).',
          periodStart: p.start,
          periodEnd: p.end,
          periodLabel: p.label,
          dueDate: due.payment,
          legalRef: ref,
        },
      );
    }

    // --- Comunicação de faturas (e-fatura) ---
    for (let m = 1; m <= 12; m++) {
      const r = monthRange(year, m);
      if (r.end < start) continue;
      const [ny, nm] = addMonths(year, m, 1);
      out.push({
        type: 'efatura_comunicacao',
        title: `Comunicação de faturas — ${monthName(m)} ${year}`,
        description: profile.invoicesAutoCommunicated
          ? 'Feita automaticamente pelo software de faturação certificado.'
          : 'Comunicação à AT dos elementos das faturas emitidas no mês.',
        periodStart: r.start,
        periodEnd: r.end,
        periodLabel: `${monthName(m)} ${year}`,
        dueDate: adjustDeadline(dayInMonth(ny, nm, resolve(ny).obligations.efaturaCommunicationDay)),
        legalRef: legalRef(params, 'obligations.efaturaCommunicationDay') || 'Art. 3.º DL 198/2012',
        automatic: profile.invoicesAutoCommunicated,
      });
    }

    if (individual) {
      // --- Segurança Social: declaração trimestral e contribuições mensais ---
      const ssStartIdx = monthIndex(start) + params.socialSecurity.exemptionFirstMonths;
      for (let q = 1; q <= 4; q++) {
        const qr = quarterRange(year, q);
        if (qr.end < start) continue;
        const [dy, dm] = addMonths(year, q * 3, 1);
        // A declaração deste trimestre fixa a base dos meses dm..dm+2; é exigida se algum deles já não estiver isento.
        if ((dy * 12 + dm - 1) + 2 < ssStartIdx) continue;
        out.push({
          type: 'ss_declaracao_trimestral',
          title: `Declaração trimestral à Segurança Social — ${q}.º trimestre ${year}`,
          description: 'Declara na Segurança Social Direta os rendimentos do trimestre (define as contribuições dos 3 meses seguintes).',
          periodStart: qr.start,
          periodEnd: qr.end,
          periodLabel: `${q}.º trimestre ${year}`,
          dueDate: adjustDeadline(dayInMonth(dy, dm, 'last')),
          legalRef: 'Art. 152.º Código dos Regimes Contributivos',
        });
      }
      for (let m = 1; m <= 12; m++) {
        if (year * 12 + m - 1 < ssStartIdx) continue;
        const r = monthRange(year, m);
        const [py, pm] = addMonths(year, m, 1);
        const pss = resolve(py).socialSecurity;
        out.push({
          type: 'ss_pagamento_contribuicoes',
          title: `Contribuições à Segurança Social — ${monthName(m)} ${year}`,
          description: 'Pagamento da contribuição mensal (por referência multibanco ou débito direto).',
          periodStart: r.start,
          periodEnd: r.end,
          periodLabel: `${monthName(m)} ${year}`,
          windowStart: dayInMonth(py, pm, pss.paymentWindowStartDay),
          dueDate: adjustDeadline(dayInMonth(py, pm, pss.paymentDay)),
          legalRef: 'Art. 155.º Código dos Regimes Contributivos',
        });
      }

      // --- IRS: Modelo 3 (rendimentos do ano anterior) ---
      const incomeYear = year - 1;
      if (makeDate(incomeYear, 12, 31) >= start) {
        out.push({
          type: 'irs_modelo3',
          title: `Declaração de IRS ${incomeYear} (Modelo 3, Anexos B e SS)`,
          description: 'Entrega no Portal das Finanças da declaração anual de rendimentos, com o Anexo B (categoria B) e o Anexo SS.',
          periodStart: makeDate(incomeYear, 1, 1),
          periodEnd: makeDate(incomeYear, 12, 31),
          periodLabel: String(incomeYear),
          windowStart: md(year, params.irs.modelo3.windowStart),
          dueDate: adjustDeadline(md(year, params.irs.modelo3.windowEnd)),
          legalRef: legalRef(params, 'irs.modelo3') || 'Art. 60.º CIRS',
        });
      }
      if (profile.irsPaymentsOnAccount) {
        params.irs.paymentsOnAccount.dueDates.forEach((d, i) =>
          out.push({
            type: 'irs_pagamento_por_conta',
            title: `${ORD[i]} pagamento por conta de IRS ${year}`,
            description: 'Adiantamento do IRS do ano, notificado pela AT.',
            periodStart: makeDate(year, 1, 1),
            periodEnd: makeDate(year, 12, 31),
            periodLabel: `${ORD[i]} pagamento ${year}`,
            dueDate: adjustDeadline(md(year, d)),
            legalRef: 'Art. 102.º CIRS',
          }),
        );
      }
    } else {
      // --- Sociedades: IRC, IES, pagamentos por conta ---
      const fy = year - 1;
      if (makeDate(fy, 12, 31) >= start) {
        out.push(
          {
            type: 'irc_modelo22',
            title: `Declaração de IRC ${fy} (Modelo 22)`,
            description: 'Declaração de rendimentos da sociedade, submetida pelo contabilista certificado.',
            periodStart: makeDate(fy, 1, 1),
            periodEnd: makeDate(fy, 12, 31),
            periodLabel: String(fy),
            dueDate: adjustDeadline(md(year, params.irc.modelo22Deadline)),
            legalRef: 'Art. 120.º CIRC',
          },
          {
            type: 'ies',
            title: `IES / Declaração Anual ${fy}`,
            description: 'Informação Empresarial Simplificada (contas anuais), submetida pelo contabilista certificado.',
            periodStart: makeDate(fy, 1, 1),
            periodEnd: makeDate(fy, 12, 31),
            periodLabel: String(fy),
            dueDate: adjustDeadline(md(year, params.irc.iesDeadline)),
            legalRef: 'Art. 121.º CIRC',
          },
        );
      }
      const ppc = profile.ircPaymentsOnAccount ?? start < makeDate(year - 1, 1, 1);
      if (ppc) {
        params.irc.paymentsOnAccountDueDates.forEach((d, i) =>
          out.push({
            type: 'irc_pagamento_por_conta',
            title: `${ORD[i]} pagamento por conta de IRC ${year}`,
            description: 'Adiantamento do IRC do ano, calculado sobre o imposto do ano anterior.',
            periodStart: makeDate(year, 1, 1),
            periodEnd: makeDate(year, 12, 31),
            periodLabel: `${ORD[i]} pagamento ${year}`,
            dueDate: adjustDeadline(md(year, d)),
            legalRef: 'Arts. 104.º e 105.º CIRC',
          }),
        );
      }
    }

    // --- Entidades com trabalhadores: declarações mensais de remunerações ---
    if (profile.hasEmployees) {
      for (let m = 1; m <= 12; m++) {
        const r = monthRange(year, m);
        if (r.end < start) continue;
        const [ny, nm] = addMonths(year, m, 1);
        const day = resolve(ny).obligations.payrollDeclarationDay;
        out.push(
          {
            type: 'dmr_retencoes',
            title: `Declaração Mensal de Remunerações (AT) — ${monthName(m)} ${year}`,
            description: 'Remunerações pagas e retenções de IRS do mês.',
            periodStart: r.start,
            periodEnd: r.end,
            periodLabel: `${monthName(m)} ${year}`,
            dueDate: adjustDeadline(dayInMonth(ny, nm, day)),
            legalRef: 'Art. 119.º, n.º 1, c) CIRS',
          },
          {
            type: 'ss_declaracao_remuneracoes',
            title: `Declaração de remunerações (Segurança Social) — ${monthName(m)} ${year}`,
            description: 'Remunerações dos trabalhadores e membros dos órgãos estatutários.',
            periodStart: r.start,
            periodEnd: r.end,
            periodLabel: `${monthName(m)} ${year}`,
            dueDate: adjustDeadline(dayInMonth(ny, nm, day)),
            legalRef: 'Art. 40.º Código dos Regimes Contributivos',
          },
        );
      }
    }
  }

  return out
    .filter((o) => o.dueDate >= range.from && o.dueDate <= range.to)
    .sort((a, b) => (a.dueDate === b.dueDate ? a.type.localeCompare(b.type) : a.dueDate < b.dueDate ? -1 : 1));
}
