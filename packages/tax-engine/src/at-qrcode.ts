import { roundCents } from './money';
import type { TaxRegion } from './types';

/**
 * Código QR dos documentos fiscais (Portaria n.º 195/2020, especificações técnicas da AT).
 * Formato: campos "CHAVE:valor" separados por "*", montantes com ponto decimal e 2 casas.
 *
 *  A NIF do emitente · B NIF do adquirente · C país do adquirente · D tipo de documento · E estado
 *  F data (AAAAMMDD) · G identificação do documento · H ATCUD
 *  I1/J1/K1 espaço fiscal (PT, PT-AC, PT-MA) · I2 base isenta · I3/I4 base/IVA taxa reduzida
 *  I5/I6 base/IVA taxa intermédia · I7/I8 base/IVA taxa normal (J*, K*: Açores e Madeira)
 *  L não sujeito/não tributável · M imposto do selo · N total de impostos · O total com impostos
 *  P retenção na fonte · Q 4 caracteres do hash · R n.º do certificado do programa · S outras informações
 */

export interface AtQrRateTotals {
  exemptBaseCents: number;
  reduced: { baseCents: number; vatCents: number };
  intermediate: { baseCents: number; vatCents: number };
  normal: { baseCents: number; vatCents: number };
}

export interface AtQrData {
  issuerNif: string;
  buyerNif: string;
  buyerCountry: string;
  docType: string;
  docStatus: string;
  date: string; // AAAA-MM-DD
  docId: string;
  atcud: string;
  region: TaxRegion;
  totals: AtQrRateTotals;
  notSubjectCents: number;
  stampDutyCents: number;
  totalTaxCents: number;
  totalCents: number;
  withholdingCents: number;
  hash: string;
  certificate: string;
  other?: string;
}

const toCents = (v: string | undefined) => (v ? roundCents(Number(v) * 100) : 0);
const fmt = (cents: number) => (cents / 100).toFixed(2);

export function parseAtQrCode(payload: string): AtQrData | null {
  const fields = new Map<string, string>();
  for (const part of payload.trim().split('*')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    fields.set(part.slice(0, i).toUpperCase(), part.slice(i + 1));
  }
  const date = fields.get('F');
  if (!fields.get('A') || !date || !/^\d{8}$/.test(date) || !fields.get('O')) return null;
  const space = fields.get('K1') ? 'K' : fields.get('J1') ? 'J' : 'I';
  const region: TaxRegion = space === 'J' ? 'acores' : space === 'K' ? 'madeira' : 'continente';
  const f = (n: number) => fields.get(`${space}${n}`);
  const amounts = [...fields.entries()].filter(([k]) => /^([IJK][2-8]|[LMNOP])$/.test(k)).map(([, v]) => v);
  if (amounts.some((v) => !/^-?\d+(\.\d{1,2})?$/.test(v))) return null;
  return {
    issuerNif: fields.get('A')!,
    buyerNif: fields.get('B') ?? '',
    buyerCountry: fields.get('C') ?? 'PT',
    docType: fields.get('D') ?? '',
    docStatus: fields.get('E') ?? 'N',
    date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
    docId: fields.get('G') ?? '',
    atcud: fields.get('H') ?? '',
    region,
    totals: {
      exemptBaseCents: toCents(f(2)),
      reduced: { baseCents: toCents(f(3)), vatCents: toCents(f(4)) },
      intermediate: { baseCents: toCents(f(5)), vatCents: toCents(f(6)) },
      normal: { baseCents: toCents(f(7)), vatCents: toCents(f(8)) },
    },
    notSubjectCents: toCents(fields.get('L')),
    stampDutyCents: toCents(fields.get('M')),
    totalTaxCents: toCents(fields.get('N')),
    totalCents: toCents(fields.get('O')),
    withholdingCents: toCents(fields.get('P')),
    hash: fields.get('Q') ?? '',
    certificate: fields.get('R') ?? '',
    other: fields.get('S'),
  };
}

/** Base total (soma das bases tributáveis e isentas). */
export function qrNetCents(d: AtQrData): number {
  const t = d.totals;
  return t.exemptBaseCents + t.reduced.baseCents + t.intermediate.baseCents + t.normal.baseCents + d.notSubjectCents;
}

export function qrVatCents(d: AtQrData): number {
  const t = d.totals;
  return t.reduced.vatCents + t.intermediate.vatCents + t.normal.vatCents;
}

/** Verifica a coerência interna do QR: base + IVA + selo = total; IVA = total de impostos − selo. */
export function validateAtQr(d: AtQrData): string[] {
  const issues: string[] = [];
  if (qrNetCents(d) + qrVatCents(d) + d.stampDutyCents !== d.totalCents) issues.push('Base + IVA não coincide com o total do documento.');
  if (qrVatCents(d) + d.stampDutyCents !== d.totalTaxCents) issues.push('Total de impostos não coincide com o IVA indicado.');
  return issues;
}

/** Gera o conteúdo do QR para um documento emitido (usado na pré-visualização das faturas). */
export function buildAtQrPayload(d: AtQrData): string {
  const space = d.region === 'acores' ? 'J' : d.region === 'madeira' ? 'K' : 'I';
  const spaceCode = d.region === 'acores' ? 'PT-AC' : d.region === 'madeira' ? 'PT-MA' : 'PT';
  const parts: string[] = [
    `A:${d.issuerNif}`,
    `B:${d.buyerNif || '999999990'}`,
    `C:${d.buyerCountry || 'PT'}`,
    `D:${d.docType}`,
    `E:${d.docStatus || 'N'}`,
    `F:${d.date.replace(/-/g, '')}`,
    `G:${d.docId}`,
    `H:${d.atcud}`,
    `${space}1:${spaceCode}`,
  ];
  const t = d.totals;
  if (t.exemptBaseCents) parts.push(`${space}2:${fmt(t.exemptBaseCents)}`);
  if (t.reduced.baseCents) parts.push(`${space}3:${fmt(t.reduced.baseCents)}`, `${space}4:${fmt(t.reduced.vatCents)}`);
  if (t.intermediate.baseCents) parts.push(`${space}5:${fmt(t.intermediate.baseCents)}`, `${space}6:${fmt(t.intermediate.vatCents)}`);
  if (t.normal.baseCents) parts.push(`${space}7:${fmt(t.normal.baseCents)}`, `${space}8:${fmt(t.normal.vatCents)}`);
  if (d.notSubjectCents) parts.push(`L:${fmt(d.notSubjectCents)}`);
  if (d.stampDutyCents) parts.push(`M:${fmt(d.stampDutyCents)}`);
  parts.push(`N:${fmt(d.totalTaxCents)}`, `O:${fmt(d.totalCents)}`);
  if (d.withholdingCents) parts.push(`P:${fmt(d.withholdingCents)}`);
  parts.push(`Q:${d.hash}`, `R:${d.certificate}`);
  if (d.other) parts.push(`S:${d.other}`);
  return parts.join('*');
}
