/** Parsers de extratos bancários: CSV (formatos dos bancos portugueses) e OFX/QFX. */

export interface ParsedTransaction {
  bookingDate: string;
  valueDate?: string;
  description: string;
  amountCents: number;
  balanceCents?: number;
  counterparty?: string;
  externalId?: string;
  currency?: string;
}

export interface ParseResult {
  rows: ParsedTransaction[];
  warnings: string[];
  format: 'csv' | 'ofx';
}

/** "1.234,56", "-1234.56", "12,50 €", "(12,50)" → cêntimos. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[€\s ]|EUR/gi, '').trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith('-')) {
    neg = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    // Só pontos: vários pontos ou exatamente 3 dígitos após o ponto = separador de milhares ("1.234").
    const parts = s.split('.');
    normalized = parts.length > 2 || parts[1]!.length === 3 ? parts.join('') : s;
  } else normalized = s;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return neg ? -cents : cents;
}

/** "31-01-2025", "31/01/2025", "31.01.2025", "2025-01-31", "20250131" → "2025-01-31". */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return iso(y, +m[2]!, +m[1]!);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt.toISOString().slice(0, 10);
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

type Col = 'date' | 'valueDate' | 'description' | 'amount' | 'debit' | 'credit' | 'balance' | 'counterparty';

function classify(header: string): Col | null {
  const h = norm(header);
  if (/^data (valor|value)|^value date/.test(h)) return 'valueDate';
  if (/^(data|date|booking)/.test(h)) return 'date';
  if (/saldo|balance/.test(h)) return 'balance';
  if (/^(debito|debitos|saida|saidas|debit)/.test(h)) return 'debit';
  if (/^(credito|creditos|entrada|entradas|credit)/.test(h)) return 'credit';
  if (/montante|valor|importancia|amount|quantia/.test(h)) return 'amount';
  if (/beneficiario|ordenante|contraparte|counterparty|payee/.test(h)) return 'counterparty';
  if (/descri|movimento|detalhe|historico|referencia|memo|concept/.test(h)) return 'description';
  return null;
}

export function parseBankCsv(input: string): ParseResult {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const warnings: string[] = [];
  const sample = lines.slice(0, 20).join('\n');
  const delim = [';', '\t', ','].sort((a, b) => sample.split(b).length - sample.split(a).length)[0]!;

  // Procura a linha de cabeçalho (os bancos põem várias linhas de informação antes).
  let headerIdx = -1;
  let map: Partial<Record<Col, number>> = {};
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const cells = splitCsvLine(lines[i]!, delim);
    const m: Partial<Record<Col, number>> = {};
    cells.forEach((c, idx) => {
      const k = classify(c);
      if (k && m[k] === undefined) m[k] = idx;
    });
    if (m.date !== undefined && (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined)) {
      headerIdx = i;
      map = m;
      break;
    }
  }
  if (headerIdx < 0) return { rows: [], warnings: ['Não foi possível identificar as colunas (data, descrição, montante).'], format: 'csv' };

  const rows: ParsedTransaction[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!, delim);
    const get = (k: Col) => (map[k] !== undefined ? (cells[map[k]!] ?? '') : '');
    const date = parseDate(get('date'));
    if (!date) {
      if (cells.some((c) => c)) warnings.push(`Linha ${i + 1} ignorada (data inválida).`);
      continue;
    }
    let amount: number | null = null;
    if (map.amount !== undefined) amount = parseAmount(get('amount'));
    else {
      const d = parseAmount(get('debit'));
      const c = parseAmount(get('credit'));
      if (d) amount = -Math.abs(d);
      else if (c) amount = Math.abs(c);
      else if (d === 0 || c === 0) amount = 0;
    }
    if (amount === null) {
      warnings.push(`Linha ${i + 1} ignorada (montante inválido).`);
      continue;
    }
    const description = get('description') || get('counterparty') || '(sem descrição)';
    rows.push({
      bookingDate: date,
      valueDate: parseDate(get('valueDate')) ?? undefined,
      description,
      amountCents: amount,
      balanceCents: map.balance !== undefined ? (parseAmount(get('balance')) ?? undefined) : undefined,
      counterparty: get('counterparty') || undefined,
    });
  }
  return { rows, warnings, format: 'csv' };
}

export function parseOfx(input: string): ParseResult {
  const warnings: string[] = [];
  const rows: ParsedTransaction[] = [];
  const blocks = input.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) ?? [];
  const tag = (b: string, t: string) => b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim();
  const currency = tag(input, 'CURDEF');
  for (const b of blocks) {
    const date = parseDate(tag(b, 'DTPOSTED') ?? '');
    const amt = tag(b, 'TRNAMT');
    const amount = amt != null ? Math.round(Number(amt.replace(',', '.')) * 100) : NaN;
    if (!date || Number.isNaN(amount)) {
      warnings.push('Movimento OFX ignorado (data ou montante inválido).');
      continue;
    }
    const name = tag(b, 'NAME');
    const memo = tag(b, 'MEMO');
    rows.push({
      bookingDate: date,
      valueDate: parseDate(tag(b, 'DTUSER') ?? '') ?? undefined,
      description: [name, memo].filter(Boolean).join(' ') || '(sem descrição)',
      amountCents: amount,
      externalId: tag(b, 'FITID'),
      counterparty: name,
      currency,
    });
  }
  return { rows, warnings, format: 'ofx' };
}

export function parseStatement(fileName: string, content: string): ParseResult {
  if (/\.(ofx|qfx)$/i.test(fileName) || /<OFX>/i.test(content)) return parseOfx(content);
  return parseBankCsv(content);
}
