import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { VAT_EXEMPTION_REASONS, type InvoiceTotals } from '@somar/tax-engine';

/**
 * Representação em PDF de faturas e orçamentos, com a imagem da empresa (cor e logótipo).
 * Quando o fornecedor certificado devolve o PDF legal, é esse que se guarda e envia.
 */

export interface PdfParty {
  name: string;
  nif?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  email?: string | null;
}

export interface DocumentPdfInput {
  kind: 'invoice' | 'quote';
  title: string; // "Fatura", "Fatura-recibo", "Nota de crédito", "Orçamento"
  number: string;
  issueDate: string;
  dueDate?: string | null;
  validUntil?: string | null;
  issuer: PdfParty;
  client: PdfParty;
  totals: InvoiceTotals;
  notes?: string | null;
  iban?: string | null;
  atcud?: string | null;
  qrPayload?: string | null;
  documentHash?: string | null;
  certificateNumber?: string | null;
  relatedDocument?: string | null;
  brandColor?: string | null;
  logo?: { data: Buffer; mimeType: string } | null;
  /** Marca d'água para documentos sem validade fiscal (fornecedor de demonstração). */
  watermark?: string | null;
}

const eur = (cents: number) =>
  new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100) + ' €';
const ptDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function hexToRgb(hex: string | null | undefined) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return rgb(0.23, 0.31, 0.77);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Quebra texto em linhas que cabem na largura (fontes standard: só carateres WinAnsi). */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of sanitize(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(t, size) > width && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** As fontes standard do PDF usam WinAnsi: remove carateres fora desse conjunto. */
function sanitize(s: string) {
  return s.replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF€\n]/g, '');
}

export async function renderDocumentPdf(d: DocumentPdfInput): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${d.title} ${d.number}`);
  pdf.setProducer('Somar');
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(d.brandColor);
  const grey = rgb(0.42, 0.42, 0.45);
  const dark = rgb(0.12, 0.12, 0.14);
  const M = 48;
  const W = 595.28 - 2 * M;
  let y = 841.89 - M;

  const text = (p: PDFPage, s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 9;
    const f = o.f ?? font;
    const str = sanitize(s);
    const xx = o.right ? x - f.widthOfTextAtSize(str, size) : x;
    p.drawText(str, { x: xx, y: yy, size, font: f, color: o.color ?? dark });
  };

  // Cabeçalho: logótipo/nome e título do documento
  if (d.logo) {
    try {
      const img = d.logo.mimeType.includes('png') ? await pdf.embedPng(d.logo.data) : await pdf.embedJpg(d.logo.data);
      const scale = Math.min(140 / img.width, 48 / img.height);
      page.drawImage(img, { x: M, y: y - img.height * scale, width: img.width * scale, height: img.height * scale });
    } catch {
      text(page, d.issuer.name, M, y - 16, { size: 14, f: bold, color: accent });
    }
  } else {
    text(page, d.issuer.name, M, y - 16, { size: 14, f: bold, color: accent });
  }
  text(page, d.title, M + W, y - 12, { size: 16, f: bold, right: true });
  text(page, d.number, M + W, y - 28, { size: 10, right: true, color: grey });
  y -= 70;

  // Emitente e cliente
  const block = (label: string, p: PdfParty, x: number) => {
    let yy = y;
    text(page, label, x, yy, { size: 8, color: grey });
    yy -= 14;
    text(page, p.name, x, yy, { size: 10, f: bold });
    for (const l of [p.addressLine, [p.postalCode, p.city].filter(Boolean).join(' '), p.nif ? `NIF ${p.nif}` : 'Consumidor final', p.email]) {
      if (!l) continue;
      yy -= 12;
      text(page, l, x, yy);
    }
    return yy;
  };
  const y1 = block('DE', d.issuer, M);
  const y2 = block('PARA', d.client, M + W / 2);
  y = Math.min(y1, y2) - 22;

  // Datas
  const meta: [string, string][] = [['Data', ptDate(d.issueDate)]];
  if (d.dueDate) meta.push(['Vencimento', ptDate(d.dueDate)]);
  if (d.validUntil) meta.push(['Válido até', ptDate(d.validUntil)]);
  if (d.relatedDocument) meta.push(['Retifica', d.relatedDocument]);
  if (d.atcud) meta.push(['ATCUD', d.atcud]);
  meta.forEach(([k, v], i) => {
    const x = M + i * (W / Math.max(meta.length, 4));
    text(page, k, x, y, { size: 8, color: grey });
    text(page, v, x, y - 13, { size: 10, f: bold });
  });
  y -= 40;

  // Linhas
  const cols = { desc: M, qty: M + W * 0.56, price: M + W * 0.7, vat: M + W * 0.8, total: M + W };
  page.drawRectangle({ x: M, y: y - 6, width: W, height: 20, color: rgb(0.96, 0.96, 0.95) });
  text(page, 'Descrição', cols.desc + 6, y, { size: 8, f: bold, color: grey });
  text(page, 'Qtd.', cols.qty, y, { size: 8, f: bold, color: grey, right: true });
  text(page, 'Preço unit.', cols.price, y, { size: 8, f: bold, color: grey, right: true });
  text(page, 'IVA', cols.vat, y, { size: 8, f: bold, color: grey, right: true });
  text(page, 'Valor', cols.total - 6, y, { size: 8, f: bold, color: grey, right: true });
  y -= 24;
  for (const l of d.totals.lines) {
    const lines = wrap(l.description, font, 9, W * 0.5);
    lines.forEach((ln, i) => text(page, ln, cols.desc + 6, y - i * 11));
    text(page, String(l.quantity).replace('.', ','), cols.qty, y, { right: true });
    text(page, eur(l.unitPriceCents) + (l.discountPct ? ` (-${l.discountPct}%)` : ''), cols.price, y, { right: true });
    text(page, `${l.vatRatePct}%`, cols.vat, y, { right: true });
    text(page, eur(l.netCents), cols.total - 6, y, { right: true });
    y -= Math.max(1, lines.length) * 11 + 10;
    page.drawLine({ start: { x: M, y: y + 13 }, end: { x: M + W, y: y + 13 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
  }
  y -= 6;

  // Resumo do IVA e totais
  const summaryTop = y;
  text(page, 'Resumo do IVA', M, y, { size: 8, f: bold, color: grey });
  y -= 13;
  for (const g of d.totals.byRate) {
    const reason = g.exemptionCode ? ` - ${g.exemptionCode}: ${VAT_EXEMPTION_REASONS[g.exemptionCode] ?? ''}` : '';
    text(page, `${g.ratePct}%  base ${eur(g.baseCents)}  IVA ${eur(g.vatCents)}${reason}`, M, y, { size: 8 });
    y -= 11;
  }
  let ty = summaryTop;
  const totalRow = (label: string, v: string, strong = false) => {
    text(page, label, M + W * 0.62, ty, { size: strong ? 11 : 9, f: strong ? bold : font, color: strong ? dark : grey });
    text(page, v, M + W, ty, { size: strong ? 11 : 9, f: strong ? bold : font, right: true });
    ty -= strong ? 18 : 13;
  };
  totalRow('Total sem IVA', eur(d.totals.netCents));
  totalRow('IVA', eur(d.totals.vatCents));
  if (d.totals.withholdingCents) totalRow(`Retenção IRS (${(d.totals.withholdingRate * 100).toFixed(1).replace('.', ',')}%)`, `-${eur(d.totals.withholdingCents)}`);
  page.drawLine({ start: { x: M + W * 0.62, y: ty + 8 }, end: { x: M + W, y: ty + 8 }, thickness: 1, color: accent });
  ty -= 4;
  totalRow(d.kind === 'quote' ? 'Total' : 'Total a pagar', eur(d.totals.totalCents), true);
  y = Math.min(y, ty) - 16;

  if (d.notes) {
    text(page, 'Observações', M, y, { size: 8, f: bold, color: grey });
    y -= 12;
    for (const ln of wrap(d.notes, font, 9, W)) {
      text(page, ln, M, y);
      y -= 11;
    }
    y -= 6;
  }
  if (d.iban && d.kind === 'invoice') {
    text(page, `Pagamento por transferência para o IBAN ${d.iban}`, M, y, { size: 9 });
    y -= 16;
  }

  // Rodapé: QR code e menções legais
  if (d.qrPayload) {
    const png = await QRCode.toBuffer(d.qrPayload, { errorCorrectionLevel: 'M', margin: 0, width: 300 });
    const img = await pdf.embedPng(png);
    page.drawImage(img, { x: M, y: M + 6, width: 86, height: 86 });
  }
  const fx = d.qrPayload ? M + 100 : M;
  let fy = M + 80;
  if (d.documentHash && d.kind === 'invoice') {
    text(page, `${d.documentHash.slice(0, 4)}-Processado por programa certificado n.º ${d.certificateNumber || '—'}/AT`, fx, fy, { size: 7.5, color: grey });
    fy -= 11;
  }
  if (d.kind === 'quote') {
    text(page, 'Este documento não serve de fatura.', fx, fy, { size: 7.5, color: grey });
    fy -= 11;
  }
  text(page, 'Documento gerado com Somar.', fx, fy, { size: 7.5, color: grey });

  if (d.watermark) {
    page.drawText(sanitize(d.watermark), { x: 70, y: 300, size: 30, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.22, rotate: degrees(35) });
  }
  return Buffer.from(await pdf.save());
}
