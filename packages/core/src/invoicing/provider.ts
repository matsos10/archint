import { createHash } from 'node:crypto';
import { buildAtQrPayload, buildAtcud, type AtQrData, type InvoiceTotals } from '@somar/tax-engine';

/**
 * Emissão de documentos através de software de faturação certificado pela AT.
 *
 * No MVP o Somar NÃO é software certificado: integra uma API de faturação já certificada, que
 * atribui a numeração, assina o documento (hash), calcula o ATCUD, gera o QR code, comunica à AT e
 * devolve o PDF legal. Ver ASSUNCOES.md. O fornecedor "sandbox" serve apenas para desenvolvimento e
 * testes e produz documentos marcados como sem validade fiscal.
 */

export interface IssueParty {
  name: string;
  nif?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
}

export interface IssueRequest {
  docType: 'FT' | 'FR' | 'FS' | 'NC';
  issueDate: string;
  dueDate?: string | null;
  series: { code: string; validationCode?: string | null; providerSeriesId?: string | null };
  /** Sequência reservada localmente (usada pelo sandbox; os fornecedores reais atribuem a sua). */
  localSequence: number;
  issuer: IssueParty & { region: 'continente' | 'madeira' | 'acores' };
  client: IssueParty;
  totals: InvoiceTotals;
  notes?: string | null;
  relatedDocumentNumber?: string | null;
  reference: string;
}

export interface IssueResult {
  number: string;
  sequence: number;
  atcud: string;
  qrPayload: string;
  documentHash: string;
  providerRef: string;
  /** PDF legal devolvido pelo fornecedor (se não, o Somar gera a representação a partir dos dados). */
  pdf?: Buffer;
  legallyValid: boolean;
}

export interface InvoicingProvider {
  readonly name: string;
  readonly certificateNumber: string;
  readonly legallyValid: boolean;
  /** Comunica a série à AT (via fornecedor) e devolve o código de validação. */
  registerSeries(input: { docType: string; code: string; year: number; firstNumber: number }): Promise<{ validationCode: string; providerSeriesId?: string }>;
  issue(req: IssueRequest): Promise<IssueResult>;
}

const DOC_NAMES: Record<string, string> = { FT: 'FT', FR: 'FR', FS: 'FS', NC: 'NC' };

/** Constrói os dados do QR a partir dos totais do documento. */
export function qrDataFor(req: IssueRequest, sequence: number, atcud: string, hash: string, certificate: string): AtQrData {
  const t = { exemptBaseCents: 0, reduced: { baseCents: 0, vatCents: 0 }, intermediate: { baseCents: 0, vatCents: 0 }, normal: { baseCents: 0, vatCents: 0 } };
  for (const g of req.totals.byRate) {
    if (g.rateCode === 'normal') t.normal = { baseCents: t.normal.baseCents + g.baseCents, vatCents: t.normal.vatCents + g.vatCents };
    else if (g.rateCode === 'intermedia') t.intermediate = { baseCents: t.intermediate.baseCents + g.baseCents, vatCents: t.intermediate.vatCents + g.vatCents };
    else if (g.rateCode === 'reduzida') t.reduced = { baseCents: t.reduced.baseCents + g.baseCents, vatCents: t.reduced.vatCents + g.vatCents };
    else t.exemptBaseCents += g.baseCents;
  }
  return {
    issuerNif: req.issuer.nif ?? '',
    buyerNif: req.client.nif || '999999990',
    buyerCountry: req.client.country ?? 'PT',
    docType: DOC_NAMES[req.docType]!,
    docStatus: 'N',
    date: req.issueDate,
    docId: `${req.docType} ${req.series.code}/${sequence}`,
    atcud,
    region: req.issuer.region,
    totals: t,
    notSubjectCents: 0,
    stampDutyCents: 0,
    totalTaxCents: req.totals.vatCents,
    // O total do QR é o total do documento com impostos (antes da retenção na fonte, indicada em P).
    totalCents: req.totals.netCents + req.totals.vatCents,
    withholdingCents: req.totals.withholdingCents,
    hash: hash.slice(0, 4),
    certificate,
  };
}

/** Fornecedor de demonstração: numeração local, ATCUD e QR válidos no formato, mas SEM validade fiscal. */
export class SandboxInvoicingProvider implements InvoicingProvider {
  readonly name = 'sandbox';
  readonly certificateNumber = '0000';
  readonly legallyValid = false;

  async registerSeries(input: { docType: string; code: string; year: number }) {
    const h = createHash('sha256').update(`${input.docType}|${input.code}|${input.year}`).digest('hex').toUpperCase();
    return { validationCode: `SB${h.replace(/[^A-Z0-9]/g, '').slice(0, 6)}` };
  }

  async issue(req: IssueRequest): Promise<IssueResult> {
    const sequence = req.localSequence;
    const number = `${req.docType} ${req.series.code}/${sequence}`;
    const atcud = buildAtcud(req.series.validationCode ?? '0', sequence);
    const hash = createHash('sha1').update(`${number}|${req.issueDate}|${req.totals.totalCents}|${req.reference}`).digest('base64');
    const qr = buildAtQrPayload(qrDataFor(req, sequence, atcud, hash, this.certificateNumber));
    return { number, sequence, atcud, qrPayload: qr, documentHash: hash, providerRef: `sandbox:${req.reference}`, legallyValid: false };
  }
}

type Fetch = typeof fetch;

/**
 * InvoiceXpress (software certificado pela AT). Cria o documento, finaliza-o (atribuição do número,
 * assinatura e comunicação à AT) e obtém ATCUD/QR/PDF. Endpoints segundo a API v2 pública do
 * InvoiceXpress — validar com a documentação e uma conta de testes antes de produção.
 */
export class InvoiceXpressProvider implements InvoicingProvider {
  readonly name = 'invoicexpress';
  readonly legallyValid = true;

  constructor(
    private readonly cfg: { account: string; apiKey: string; certificateNumber?: string; timeoutMs?: number },
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  get certificateNumber() {
    return this.cfg.certificateNumber ?? '';
  }

  private url(path: string) {
    const sep = path.includes('?') ? '&' : '?';
    return `https://${this.cfg.account}.app.invoicexpress.com${path}${sep}api_key=${encodeURIComponent(this.cfg.apiKey)}`;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await this.fetchImpl(this.url(path), {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 20_000),
    });
    if (!res.ok && res.status !== 202) throw new Error(`InvoiceXpress ${res.status} em ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
    const text = await res.text();
    return { status: res.status, data: (text ? JSON.parse(text) : {}) as T };
  }

  private resource(docType: IssueRequest['docType']) {
    return { FT: 'invoices', FR: 'invoice_receipts', FS: 'simplified_invoices', NC: 'credit_notes' }[docType];
  }

  async registerSeries(input: { docType: string; code: string }) {
    const r = await this.call<{ sequence: { id: number; [k: string]: unknown } }>('POST', '/sequences.json', { sequence: { serie: input.code, default_sequence: '0' } });
    const s = r.data.sequence;
    const key = `${this.resource(input.docType as IssueRequest['docType']).replace(/s$/, '')}_sequence_validation_code`;
    return { validationCode: String(s[key] ?? s.validation_code ?? ''), providerSeriesId: String(s.id) };
  }

  async issue(req: IssueRequest): Promise<IssueResult> {
    const resource = this.resource(req.docType);
    const singular = resource.replace(/s$/, '');
    const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
    const exemption = req.totals.lines.find((l) => l.vatExemptionCode)?.vatExemptionCode;
    const created = await this.call<Record<string, { id: number }>>('POST', `/${resource}.json`, {
      [singular]: {
        date: ddmmyyyy(req.issueDate),
        due_date: ddmmyyyy(req.dueDate ?? req.issueDate),
        reference: req.reference,
        observations: req.notes ?? undefined,
        sequence_id: req.series.providerSeriesId ?? undefined,
        retention: req.totals.withholdingRate ? String(req.totals.withholdingRate * 100) : undefined,
        tax_exemption: exemption ?? undefined,
        owner_invoice_id: req.relatedDocumentNumber ?? undefined,
        client: {
          name: req.client.name,
          code: req.client.nif || req.client.name,
          fiscal_id: req.client.nif ?? undefined,
          email: req.client.email ?? undefined,
          address: req.client.addressLine ?? undefined,
          postal_code: req.client.postalCode ?? undefined,
          city: req.client.city ?? undefined,
          country: req.client.country === 'PT' || !req.client.country ? 'Portugal' : req.client.country,
        },
        items: req.totals.lines.map((l) => ({
          name: l.description.slice(0, 60),
          description: l.description,
          unit_price: (l.unitPriceCents / 100).toFixed(2),
          quantity: String(l.quantity),
          discount: l.discountPct ?? 0,
          tax: { name: l.vatRatePct ? `IVA${l.vatRatePct}` : 'IVA0' },
        })),
      },
    });
    const id = created.data[singular]!.id;
    const fin = await this.call<Record<string, { sequence_number: string; inverted_sequence_number?: string; atcud?: string; qr_code?: string; saft_hash?: string }>>(
      'PUT',
      `/${resource}/${id}/change-state.json`,
      { [singular]: { state: 'finalized' } },
    );
    const doc = fin.data[singular]!;
    // "7/2026A" (sequence_number) ou "2026A/7" (inverted_sequence_number)
    const seqMatch = String(doc.inverted_sequence_number ?? '').match(/\/(\d+)$/) ?? String(doc.sequence_number ?? '').match(/^(\d+)/);
    const sequence = seqMatch ? Number(seqMatch[1]) : req.localSequence;
    let pdf: Buffer | undefined;
    for (let i = 0; i < 5 && !pdf; i++) {
      const p = await this.call<{ output?: { pdfUrl?: string } }>('GET', `/api/pdf/${id}.json`);
      if (p.status === 200 && p.data.output?.pdfUrl) {
        const file = await this.fetchImpl(p.data.output.pdfUrl, { signal: AbortSignal.timeout(20_000) });
        if (file.ok) pdf = Buffer.from(await file.arrayBuffer());
      } else await new Promise((r) => setTimeout(r, 800));
    }
    return {
      number: `${req.docType} ${doc.inverted_sequence_number ?? doc.sequence_number}`,
      sequence,
      atcud: doc.atcud ?? buildAtcud(req.series.validationCode ?? '0', sequence),
      qrPayload: doc.qr_code ?? '',
      documentHash: doc.saft_hash ?? '',
      providerRef: `invoicexpress:${resource}:${id}`,
      pdf,
      legallyValid: true,
    };
  }
}

let provider: InvoicingProvider | undefined;
export function defaultInvoicingProvider(): InvoicingProvider {
  if (provider) return provider;
  const account = process.env.INVOICEXPRESS_ACCOUNT;
  const key = process.env.INVOICEXPRESS_API_KEY;
  provider =
    account && key
      ? new InvoiceXpressProvider({ account, apiKey: key, certificateNumber: process.env.INVOICEXPRESS_CERTIFICATE })
      : new SandboxInvoicingProvider();
  return provider;
}

export function setDefaultInvoicingProvider(p: InvoicingProvider) {
  provider = p;
}
