import type { IrsResult, SsResult, VatPeriodResult, IrcResult } from '@somar/tax-engine';

/**
 * Dados de apoio às declarações. O Somar prepara os valores (calculados pelo motor fiscal a partir da
 * contabilidade) e o passo a passo; a submissão é sempre feita pelo utilizador ou pelo contabilista no
 * portal oficial. Os números de campo seguem os modelos oficiais em vigor à data — a confirmar em cada
 * campanha (sinalizados com `verify`).
 */

export interface DeclarationField {
  code: string;
  label: string;
  valueCents?: number;
  value?: string;
  verify?: boolean;
  note?: string;
}

export interface DeclarationSection {
  title: string;
  fields: DeclarationField[];
}

export interface DeclarationFile {
  name: string;
  mimeType: string;
  content: string;
}

export interface DeclarationData {
  type: string;
  title: string;
  periodLabel: string;
  portal: { name: string; url: string };
  summary: { label: string; valueCents: number; emphasis?: boolean }[];
  sections: DeclarationSection[];
  steps: string[];
  warnings: string[];
  files: DeclarationFile[];
}

const eur = (cents: number) => (cents / 100).toFixed(2);

function csvOf(sections: DeclarationSection[]): string {
  const rows = [['Quadro', 'Campo', 'Descrição', 'Valor (EUR)']];
  for (const s of sections) for (const f of s.fields) rows.push([s.title, f.code, f.label, f.valueCents != null ? eur(f.valueCents) : (f.value ?? '')]);
  return rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\n') + '\n';
}

function withFiles(d: Omit<DeclarationData, 'files'>, slug: string, extra: DeclarationFile[] = []): DeclarationData {
  return {
    ...d,
    files: [
      { name: `${slug}.csv`, mimeType: 'text/csv', content: csvOf(d.sections) },
      { name: `${slug}.json`, mimeType: 'application/json', content: JSON.stringify({ type: d.type, period: d.periodLabel, sections: d.sections, summary: d.summary }, null, 2) },
      ...extra,
    ],
  };
}

// ---------------------------------------------------------------------------
// IVA — declaração periódica (Quadro 06, continente)
// ---------------------------------------------------------------------------

export function buildVatDeclaration(input: { nif: string | null; periodLabel: string; periodicity: 'mensal' | 'trimestral'; result: VatPeriodResult }): DeclarationData {
  const r = input.result;
  const f = r.fields;
  const sections: DeclarationSection[] = [
    {
      title: 'Quadro 06 — Operações ativas (IVA liquidado)',
      fields: [
        { code: '1', label: 'Base tributável à taxa reduzida', valueCents: f['1'] },
        { code: '2', label: 'IVA à taxa reduzida', valueCents: f['2'] },
        { code: '5', label: 'Base tributável à taxa intermédia', valueCents: f['5'] },
        { code: '6', label: 'IVA à taxa intermédia', valueCents: f['6'] },
        { code: '3', label: 'Base tributável à taxa normal', valueCents: f['3'] },
        { code: '4', label: 'IVA à taxa normal', valueCents: f['4'] },
        ...(r.output.exemptBaseCents ? [{ code: '8', label: 'Operações isentas sem direito a dedução (verificar o campo aplicável)', valueCents: r.output.exemptBaseCents, verify: true }] : []),
      ],
    },
    {
      title: 'Quadro 06 — IVA dedutível',
      fields: [
        { code: '20', label: 'Imobilizado', valueCents: f['20'] },
        { code: '21', label: 'Existências à taxa reduzida', valueCents: f['21'] },
        { code: '23', label: 'Existências à taxa intermédia', valueCents: f['23'] },
        { code: '22', label: 'Existências à taxa normal', valueCents: f['22'] },
        { code: '24', label: 'Outros bens e serviços', valueCents: f['24'] },
      ],
    },
    {
      title: 'Quadro 06 — Apuramento',
      fields: [
        { code: '61', label: 'Excesso a reportar do período anterior', valueCents: f['61'] },
        { code: '93', label: 'Imposto a favor do Estado', valueCents: f['93'] },
        { code: '96', label: 'Imposto a favor do sujeito passivo (a reportar)', valueCents: f['96'] },
      ],
    },
  ];
  const due = r.dueDates;
  return withFiles(
    {
      type: 'iva_declaracao_periodica',
      title: `Declaração periódica de IVA — ${input.periodLabel}`,
      periodLabel: input.periodLabel,
      portal: { name: 'Portal das Finanças', url: 'https://www.portaldasfinancas.gov.pt' },
      summary: [
        { label: 'IVA liquidado', valueCents: r.output.totalVatCents },
        { label: 'IVA dedutível', valueCents: r.input.deductibleCents },
        { label: r.balanceCents >= 0 ? 'IVA a pagar' : 'Crédito a reportar', valueCents: Math.abs(r.balanceCents), emphasis: true },
      ],
      sections,
      steps: [
        'Entra no Portal das Finanças com o teu NIF e senha (ou Chave Móvel Digital).',
        'Vai a "Os seus serviços" → pesquisa "IVA" → "Entregar declaração" (declaração periódica).',
        `Escolhe o período ${input.periodLabel} (periodicidade ${input.periodicity}).`,
        'No Quadro 06, preenche os campos com os valores indicados ao lado (deixa a zero os restantes).',
        'Valida a declaração; se houver alertas, compara com os valores desta página antes de corrigir.',
        'Submete e guarda o comprovativo. Se houver imposto a pagar, obtém a referência de pagamento.',
        due ? `Prazos: entrega até ${due.declaration.split('-').reverse().join('/')}, pagamento até ${due.payment.split('-').reverse().join('/')}.` : '',
        'De volta ao Somar, marca a declaração como submetida (e o pagamento como feito).',
      ].filter(Boolean),
      warnings: [...r.warnings, 'Confirma os números dos campos no modelo em vigor; as Regiões Autónomas usam campos próprios.'],
    },
    `iva-${input.periodLabel.replace(/\W+/g, '-')}`,
  );
}

// ---------------------------------------------------------------------------
// IRS — Modelo 3, Anexo B (regime simplificado) e Anexo SS
// ---------------------------------------------------------------------------

const ANEXO_B_INCOME_FIELDS: Record<string, { code: string; label: string }> = {
  vendas: { code: '401', label: 'Vendas de mercadorias e produtos' },
  hotelaria_restauracao: { code: '402', label: 'Prestações de serviços de hotelaria, restauração e bebidas' },
  servicos_tabela_151: { code: '403', label: 'Rendimentos das atividades profissionais da tabela do art. 151.º' },
  servicos_outros: { code: '404', label: 'Outras prestações de serviços' },
  propriedade_intelectual: { code: '405', label: 'Rendimentos da propriedade intelectual/industrial' },
  subsidios_exploracao: { code: '409', label: 'Subsídios destinados à exploração' },
  subsidios_outros: { code: '410', label: 'Outros subsídios' },
};

export interface WithholdingByPayer {
  payerNif: string;
  payerName: string;
  incomeCents: number;
  withholdingCents: number;
}

export function buildIrsDeclaration(input: {
  year: number;
  nif: string | null;
  cirsActivityCode?: string | null;
  cae?: string | null;
  irs: IrsResult;
  withholdings: WithholdingByPayer[];
  justification: { efaturaCents: number; socialSecurityCents: number };
  clientsIncome: { nif: string; name: string; incomeCents: number }[];
}): DeclarationData {
  const { irs } = input;
  const simplified = irs.regime === 'irs_simplificado';
  const totalServices = input.clientsIncome.reduce((s, c) => s + c.incomeCents, 0);
  const sections: DeclarationSection[] = [
    {
      title: 'Anexo B — Quadro 3 (identificação)',
      fields: [
        { code: '03', label: 'NIF do titular', value: input.nif ?? '(em falta)' },
        { code: '04', label: 'Código da atividade (tabela do art. 151.º) ou CAE', value: input.cirsActivityCode || input.cae || '(indicar)' },
        { code: '05/06', label: 'Regime', value: simplified ? 'Regime simplificado' : 'Contabilidade organizada (Anexo C)' },
      ],
    },
    {
      title: 'Anexo B — Quadro 4A (rendimentos brutos)',
      fields: irs.catB.byType.map((t) => ({ code: ANEXO_B_INCOME_FIELDS[t.type]!.code, label: ANEXO_B_INCOME_FIELDS[t.type]!.label, valueCents: t.grossCents, verify: true })),
    },
    {
      title: 'Anexo B — Quadro 4C (justificação de despesas, art. 31.º, n.º 13)',
      fields: [
        { code: '—', label: 'Despesas comunicadas no e-fatura afetas à atividade (confirmar no portal e-fatura)', valueCents: input.justification.efaturaCents, verify: true, note: 'Confirma que estas faturas estão classificadas como "atividade" no e-fatura.' },
        { code: '—', label: 'Contribuições obrigatórias para a Segurança Social', valueCents: input.justification.socialSecurityCents, verify: true },
      ],
    },
    {
      title: 'Anexo B — Quadro 6 (retenções na fonte)',
      fields: input.withholdings.flatMap((w) => [
        { code: `NIF ${w.payerNif}`, label: `${w.payerName} — rendimento`, valueCents: w.incomeCents },
        { code: `NIF ${w.payerNif}`, label: `${w.payerName} — retenção`, valueCents: w.withholdingCents },
      ]),
    },
    {
      title: 'Anexo SS — rendimentos por adquirente',
      fields: input.clientsIncome.map((c) => ({
        code: `NIF ${c.nif}`,
        label: `${c.name}${totalServices && c.incomeCents / totalServices >= 0.5 ? ' (≥ 50%: entidade contratante)' : ''}`,
        valueCents: c.incomeCents,
        verify: true,
      })),
    },
  ];
  return withFiles(
    {
      type: 'irs_modelo3',
      title: `IRS ${input.year} — Modelo 3 com Anexos B e SS`,
      periodLabel: String(input.year),
      portal: { name: 'Portal das Finanças', url: 'https://irs.portaldasfinancas.gov.pt' },
      summary: [
        { label: 'Rendimentos brutos (cat. B)', valueCents: irs.catB.grossCents },
        { label: 'Rendimento coletável', valueCents: irs.collectableCents },
        { label: 'Imposto estimado', valueCents: irs.netTaxCents },
        { label: 'Retenções na fonte', valueCents: irs.withholdingCents },
        { label: irs.resultCents >= 0 ? 'Estimativa a pagar' : 'Estimativa de reembolso', valueCents: Math.abs(irs.resultCents), emphasis: true },
      ],
      sections,
      steps: [
        `Entre 1 de abril e 30 de junho de ${input.year + 1}, entra no Portal das Finanças → IRS → "Entregar declaração".`,
        'Confirma se o IRS Automático não se aplica (com rendimentos da categoria B normalmente não se aplica).',
        'Preenche a folha de rosto e o Anexo A (se tiveres trabalho dependente), H (deduções) e B.',
        'No Anexo B, Quadro 4A, indica os rendimentos brutos nos campos ao lado; confirma o código de atividade.',
        'No Quadro 6 do Anexo B, confirma as retenções na fonte por NIF da entidade pagadora (a AT já tem estes dados das tuas faturas-recibo/faturas).',
        'Preenche o Anexo SS com os rendimentos por adquirente (a AT pré-preenche a partir do e-fatura).',
        'Usa "Simular" e compara o resultado com a estimativa do Somar; diferenças grandes devem ser revistas antes de submeter.',
        'Submete, guarda o comprovativo e marca a declaração como submetida no Somar.',
      ],
      warnings: [
        ...irs.warnings,
        'Os números de campo do Anexo B e do Anexo SS mudam entre campanhas: confirma no modelo oficial.',
        'Estimativa individual: se fizeres tributação conjunta ou tiveres outras deduções, o resultado muda.',
      ],
    },
    `irs-${input.year}`,
  );
}

// ---------------------------------------------------------------------------
// Segurança Social — declaração trimestral
// ---------------------------------------------------------------------------

export function buildSsDeclaration(input: { year: number; quarter: number; servicesCents: number; salesCents: number; result?: SsResult['quarters'][number] }): DeclarationData {
  const r = input.result;
  const sections: DeclarationSection[] = [
    {
      title: 'Rendimentos do trimestre',
      fields: [
        { code: 'Serviços', label: 'Prestação de serviços (valor faturado sem IVA)', valueCents: input.servicesCents },
        { code: 'Vendas', label: 'Produção e venda de bens (valor faturado sem IVA)', valueCents: input.salesCents },
      ],
    },
    ...(r
      ? [
          {
            title: 'Contribuições resultantes (estimativa)',
            fields: [
              { code: 'RR', label: 'Rendimento relevante', valueCents: r.relevantIncomeCents },
              { code: 'BI', label: 'Base de incidência mensal', valueCents: r.monthlyBaseCents },
              { code: 'C', label: `Contribuição mensal (${(r.rate * 100).toFixed(1)}%)`, valueCents: r.monthlyContributionCents },
            ],
          },
        ]
      : []),
  ];
  return withFiles(
    {
      type: 'ss_declaracao_trimestral',
      title: `Declaração trimestral à Segurança Social — ${input.quarter}.º trimestre ${input.year}`,
      periodLabel: `${input.quarter}.º trimestre ${input.year}`,
      portal: { name: 'Segurança Social Direta', url: 'https://app.seg-social.pt' },
      summary: [
        { label: 'Rendimentos do trimestre', valueCents: input.servicesCents + input.salesCents },
        ...(r ? [{ label: 'Contribuição mensal estimada', valueCents: r.monthlyContributionCents, emphasis: true }] : []),
      ],
      sections,
      steps: [
        'Entra na Segurança Social Direta com o NISS e a palavra-passe (ou Chave Móvel Digital).',
        'Vai a "Emprego" → "Trabalho independente" → "Declaração trimestral".',
        'A declaração vem pré-preenchida com as faturas comunicadas à AT: confirma os valores com os indicados aqui.',
        'Se pretenderes, ajusta a base de incidência (entre −25% e +25%).',
        'Submete. As contribuições dos 3 meses seguintes ficam definidas e pagam-se entre o dia 10 e 20 de cada mês.',
        'Marca a declaração como submetida no Somar.',
      ],
      warnings: ['Inclui só os rendimentos da atividade independente faturados no trimestre (sem IVA).'],
    },
    `ss-${input.year}-T${input.quarter}`,
  );
}

// ---------------------------------------------------------------------------
// Sociedades — apoio à IES/Modelo 22 (para o contabilista certificado)
// ---------------------------------------------------------------------------

export function buildCompanyAnnualSupport(input: { year: number; nif: string | null; incomeCents: number; expensesBySnc: { account: string; label: string; cents: number }[]; irc?: IrcResult }): DeclarationData {
  const expenses = input.expensesBySnc.reduce((s, e) => s + e.cents, 0);
  const sections: DeclarationSection[] = [
    { title: 'Rendimentos', fields: [{ code: '71/72', label: 'Vendas e prestações de serviços', valueCents: input.incomeCents }] },
    { title: 'Gastos por conta SNC (sugestão)', fields: input.expensesBySnc.map((e) => ({ code: e.account, label: e.label, valueCents: e.cents, verify: true })) },
    { title: 'Resultado', fields: [{ code: '—', label: 'Resultado antes de impostos (estimativa)', valueCents: input.incomeCents - expenses }] },
  ];
  return withFiles(
    {
      type: 'ies',
      title: `Apoio à IES e ao Modelo 22 — ${input.year}`,
      periodLabel: String(input.year),
      portal: { name: 'Portal das Finanças (contabilista certificado)', url: 'https://www.portaldasfinancas.gov.pt' },
      summary: [
        { label: 'Rendimentos', valueCents: input.incomeCents },
        { label: 'Gastos', valueCents: expenses },
        ...(input.irc ? [{ label: 'IRC estimado', valueCents: input.irc.totalCents, emphasis: true }] : []),
      ],
      sections,
      steps: [
        'A IES e o Modelo 22 de uma sociedade são submetidos pelo contabilista certificado responsável.',
        'Partilha com o teu contabilista estes ficheiros (resumo e extrato de movimentos categorizados) ou dá-lhe acesso delegado à conta.',
        'O contabilista fecha as contas (depreciações, acréscimos, inventários) e calcula o IRC final.',
        'Modelo 22 até ao fim de maio; IES até 15 de julho do ano seguinte.',
      ],
      warnings: ['Resumo indicativo: não inclui depreciações, acréscimos e diferimentos nem tributações autónomas.'],
    },
    `ies-${input.year}`,
  );
}

// ---------------------------------------------------------------------------
// SAF-T (PT) de faturação — ficheiro XML com os documentos emitidos
// ---------------------------------------------------------------------------

export interface SaftInvoice {
  number: string;
  atcud: string;
  docType: string;
  issueDate: string;
  status: string;
  hash: string;
  customer: { id: string; nif: string; name: string; address?: string | null; postalCode?: string | null; city?: string | null; country: string };
  lines: { position: number; description: string; quantity: number; unitPriceCents: number; netCents: number; vatRatePct: number; vatExemptionCode?: string | null; vatRateCode: string }[];
  netCents: number;
  vatCents: number;
  totalCents: number;
  withholdingCents: number;
}

const x = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * SAF-T (PT) 1.04_01 com MasterFiles (clientes, impostos) e SourceDocuments/SalesInvoices.
 * Gerado para conferência/entrega ao contabilista; o SAF-T de faturação legal é o produzido pelo
 * software certificado. Validar contra o XSD oficial antes de qualquer submissão.
 */
export function buildSaftInvoicing(input: {
  company: { nif: string; name: string; address: string; postalCode: string; city: string };
  period: { start: string; end: string };
  invoices: SaftInvoice[];
  software: { certificate: string; producerNif: string; name: string; version: string };
}): string {
  const fy = input.period.start.slice(0, 4);
  const customers = [...new Map(input.invoices.map((i) => [i.customer.id, i.customer])).values()];
  const taxCode = (pct: number, code: string) => (code === 'normal' ? 'NOR' : code === 'intermedia' ? 'INT' : code === 'reduzida' ? 'RED' : pct === 0 ? 'ISE' : 'OUT');
  const valid = input.invoices.filter((i) => i.status !== 'draft');
  const credit = valid.filter((i) => i.docType !== 'NC').reduce((s, i) => s + i.netCents, 0);
  const debit = valid.filter((i) => i.docType === 'NC').reduce((s, i) => s + i.netCents, 0);
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:PT_1.04_01">');
  lines.push('<Header>');
  lines.push(`<AuditFileVersion>1.04_01</AuditFileVersion><CompanyID>${x(input.company.nif)}</CompanyID><TaxRegistrationNumber>${x(input.company.nif)}</TaxRegistrationNumber><TaxAccountingBasis>F</TaxAccountingBasis>`);
  lines.push(`<CompanyName>${x(input.company.name)}</CompanyName><CompanyAddress><AddressDetail>${x(input.company.address)}</AddressDetail><City>${x(input.company.city)}</City><PostalCode>${x(input.company.postalCode)}</PostalCode><Country>PT</Country></CompanyAddress>`);
  lines.push(`<FiscalYear>${fy}</FiscalYear><StartDate>${input.period.start}</StartDate><EndDate>${input.period.end}</EndDate><CurrencyCode>EUR</CurrencyCode><DateCreated>${new Date().toISOString().slice(0, 10)}</DateCreated><TaxEntity>Global</TaxEntity>`);
  lines.push(`<ProductCompanyTaxID>${x(input.software.producerNif)}</ProductCompanyTaxID><SoftwareCertificateNumber>${x(input.software.certificate)}</SoftwareCertificateNumber><ProductID>${x(input.software.name)}</ProductID><ProductVersion>${x(input.software.version)}</ProductVersion>`);
  lines.push('</Header>');
  lines.push('<MasterFiles>');
  for (const c of customers) {
    lines.push(`<Customer><CustomerID>${x(c.id)}</CustomerID><AccountID>Desconhecido</AccountID><CustomerTaxID>${x(c.nif || '999999990')}</CustomerTaxID><CompanyName>${x(c.name)}</CompanyName><BillingAddress><AddressDetail>${x(c.address || 'Desconhecido')}</AddressDetail><City>${x(c.city || 'Desconhecido')}</City><PostalCode>${x(c.postalCode || 'Desconhecido')}</PostalCode><Country>${x(c.country || 'PT')}</Country></BillingAddress><SelfBillingIndicator>0</SelfBillingIndicator></Customer>`);
  }
  const rates = new Map<string, number>();
  for (const i of valid) for (const l of i.lines) rates.set(taxCode(l.vatRatePct, l.vatRateCode), l.vatRatePct);
  lines.push('<TaxTable>');
  for (const [code, pct] of rates) lines.push(`<TaxTableEntry><TaxType>IVA</TaxType><TaxCountryRegion>PT</TaxCountryRegion><TaxCode>${code}</TaxCode><Description>${code}</Description><TaxPercentage>${pct.toFixed(2)}</TaxPercentage></TaxTableEntry>`);
  lines.push('</TaxTable>');
  lines.push('</MasterFiles>');
  lines.push('<SourceDocuments><SalesInvoices>');
  lines.push(`<NumberOfEntries>${valid.length}</NumberOfEntries><TotalDebit>${eur(debit)}</TotalDebit><TotalCredit>${eur(credit)}</TotalCredit>`);
  for (const i of valid) {
    lines.push('<Invoice>');
    lines.push(`<InvoiceNo>${x(i.number)}</InvoiceNo><ATCUD>${x(i.atcud)}</ATCUD><DocumentStatus><InvoiceStatus>${i.status === 'cancelled' ? 'A' : 'N'}</InvoiceStatus><InvoiceStatusDate>${i.issueDate}T00:00:00</InvoiceStatusDate><SourceID>Somar</SourceID><SourceBilling>P</SourceBilling></DocumentStatus>`);
    lines.push(`<Hash>${x(i.hash)}</Hash><HashControl>1</HashControl><Period>${Number(i.issueDate.slice(5, 7))}</Period><InvoiceDate>${i.issueDate}</InvoiceDate><InvoiceType>${x(i.docType)}</InvoiceType>`);
    lines.push(`<SpecialRegimes><SelfBillingIndicator>0</SelfBillingIndicator><CashVATSchemeIndicator>0</CashVATSchemeIndicator><ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator></SpecialRegimes><SourceID>Somar</SourceID><SystemEntryDate>${i.issueDate}T00:00:00</SystemEntryDate><CustomerID>${x(i.customer.id)}</CustomerID>`);
    for (const l of i.lines) {
      const amountTag = i.docType === 'NC' ? 'DebitAmount' : 'CreditAmount';
      lines.push(`<Line><LineNumber>${l.position}</LineNumber><ProductCode>SERV</ProductCode><ProductDescription>${x(l.description)}</ProductDescription><Quantity>${l.quantity}</Quantity><UnitOfMeasure>UN</UnitOfMeasure><UnitPrice>${eur(l.unitPriceCents)}</UnitPrice><TaxPointDate>${i.issueDate}</TaxPointDate><Description>${x(l.description)}</Description><${amountTag}>${eur(l.netCents)}</${amountTag}><Tax><TaxType>IVA</TaxType><TaxCountryRegion>PT</TaxCountryRegion><TaxCode>${taxCode(l.vatRatePct, l.vatRateCode)}</TaxCode><TaxPercentage>${l.vatRatePct.toFixed(2)}</TaxPercentage></Tax>${l.vatExemptionCode ? `<TaxExemptionReason>Isento</TaxExemptionReason><TaxExemptionCode>${x(l.vatExemptionCode)}</TaxExemptionCode>` : ''}</Line>`);
    }
    lines.push(`<DocumentTotals><TaxPayable>${eur(i.vatCents)}</TaxPayable><NetTotal>${eur(i.netCents)}</NetTotal><GrossTotal>${eur(i.netCents + i.vatCents)}</GrossTotal></DocumentTotals>`);
    if (i.withholdingCents) lines.push(`<WithholdingTax><WithholdingTaxType>IRS</WithholdingTaxType><WithholdingTaxAmount>${eur(i.withholdingCents)}</WithholdingTaxAmount></WithholdingTax>`);
    lines.push('</Invoice>');
  }
  lines.push('</SalesInvoices></SourceDocuments>');
  lines.push('</AuditFile>');
  return lines.join('\n');
}
