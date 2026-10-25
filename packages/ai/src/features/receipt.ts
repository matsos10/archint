import { z } from 'zod';
import { checkDocumentVat, isValidNif, type TaxParams, type TaxRegion, type VatRateCode } from '@somar/tax-engine';
import type { AiFeature } from '../runner';

export interface ReceiptInput {
  file: { mimeType: string; base64: string };
  accountNif: string | null;
  region: TaxRegion;
  params: TaxParams;
}

const output = z.object({
  isInvoice: z.boolean(),
  supplierName: z.string().nullable(),
  supplierNif: z.string().nullable(),
  buyerNif: z.string().nullable(),
  documentNumber: z.string().nullable(),
  atcud: z.string().nullable(),
  documentDate: z.string().nullable(),
  totalEuros: z.number().nullable(),
  vatEuros: z.number().nullable(),
  vatRateCode: z.enum(['normal', 'intermedia', 'reduzida', 'isenta']).nullable(),
  confidence: z.number(),
});

export interface ReceiptExtraction {
  supplierName?: string;
  supplierNif?: string;
  buyerNif?: string;
  documentNumber?: string;
  atcud?: string;
  documentDate?: string;
  totalCents?: number;
  vatCents?: number;
  vatRateCode?: VatRateCode;
  confidence: number;
  issues: string[];
}

const cents = (eur: number | null) => (eur == null ? undefined : Math.round(eur * 100));

export const receiptFeature: AiFeature<ReceiptInput, z.infer<typeof output>, ReceiptExtraction> = {
  name: 'receipt_ocr',
  effort: 'medium',
  maxTokens: 2000,
  timeoutMs: 45_000,
  system: [
    'Extrai os dados de um documento de despesa português (fatura, fatura-recibo, fatura simplificada ou talão).',
    'Copia os valores exatamente como estão impressos; não calcules nem corrijas. Usa null quando um campo não for legível.',
    'NIF: 9 dígitos, sem prefixo "PT". Datas no formato AAAA-MM-DD. Montantes em euros, com ponto decimal.',
    'vatRateCode: normal (23%/22%/16%), intermedia (13%/12%/9%), reduzida (6%/5%/4%), isenta (0%). Se houver várias taxas, indica a predominante.',
    'isInvoice = false se o documento não for uma fatura (ex.: comprovativo de pagamento multibanco).',
  ].join('\n'),
  output,
  build: (i) => [
    i.file.mimeType === 'application/pdf'
      ? { type: 'pdf', base64: i.file.base64 }
      : { type: 'image', mediaType: (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(i.file.mimeType) ? i.file.mimeType : 'image/jpeg') as 'image/jpeg', base64: i.file.base64 },
    { type: 'text', text: 'Extrai os dados deste documento.' },
  ],
  summarize: (i) => ({ mimeType: i.file.mimeType, bytes: Math.round((i.file.base64.length * 3) / 4) }),
  validate: (o, input) => {
    const issues: string[] = [];
    let confidence = Math.min(0.95, Math.max(0, o.confidence));
    const nif = (v: string | null) => (v ? v.replace(/\D/g, '').slice(-9) : null);
    let supplierNif = nif(o.supplierNif);
    if (supplierNif && !isValidNif(supplierNif)) {
      issues.push('NIF do fornecedor inválido (dígito de controlo).');
      supplierNif = null;
      confidence -= 0.2;
    }
    const buyerNif = nif(o.buyerNif);
    if (input.accountNif && buyerNif !== input.accountNif) {
      issues.push(buyerNif ? 'A fatura não está emitida com o teu NIF: o IVA não é dedutível.' : 'O documento não tem o teu NIF: pede uma fatura com NIF para deduzires o IVA.');
      confidence -= 0.1;
    }
    let documentDate = o.documentDate ?? undefined;
    if (documentDate && (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || Number.isNaN(Date.parse(documentDate)) || documentDate > new Date().toISOString().slice(0, 10))) {
      issues.push('Data inválida.');
      documentDate = undefined;
      confidence -= 0.2;
    }
    const total = cents(o.totalEuros);
    let vat = cents(o.vatEuros);
    if (total != null && (total <= 0 || total > 10_000_000_00)) return { proposal: null, issues: ['Total inválido.'] };
    if (vat != null && total != null && (vat < 0 || vat > total)) {
      issues.push('IVA superior ao total: ignorado.');
      vat = undefined;
      confidence -= 0.3;
    }
    if (total != null && vat != null && o.vatRateCode && o.vatRateCode !== 'isenta') {
      // Validação pelo motor fiscal: o IVA tem de corresponder à taxa indicada (tolerância de arredondamento).
      const check = checkDocumentVat({ netCents: total - vat, vatCents: vat, rateCode: o.vatRateCode, region: input.region }, input.params, 2);
      if (!check.ok) {
        issues.push(`IVA não corresponde à taxa ${o.vatRateCode} (esperado ${(check.expectedVatCents / 100).toFixed(2)} €): confirma os valores.`);
        confidence -= 0.3;
      }
    }
    if (!o.isInvoice) {
      issues.push('Não parece uma fatura: não serve de justificativo para o IVA.');
      confidence -= 0.3;
    }
    return {
      proposal: {
        supplierName: o.supplierName?.slice(0, 200) ?? undefined,
        supplierNif: supplierNif ?? undefined,
        buyerNif: buyerNif ?? undefined,
        documentNumber: o.documentNumber?.slice(0, 60) ?? undefined,
        atcud: o.atcud?.slice(0, 100) ?? undefined,
        documentDate,
        totalCents: total,
        vatCents: vat,
        vatRateCode: o.vatRateCode ?? undefined,
        confidence: Math.max(0, Math.round(confidence * 100) / 100),
        issues,
      },
      issues,
    };
  },
};
