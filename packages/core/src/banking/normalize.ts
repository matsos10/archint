import { sha256Hex } from '../crypto';

/** Normaliza descrições bancárias: maiúsculas, sem acentos nem pontuação, espaços simples. */
export function normalizeDescription(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NOISE = new Set([
  'COMPRA', 'COMPRAS', 'DD', 'DEB', 'DEBITO', 'DIRETO', 'TRF', 'TRANSF', 'TRANSFERENCIA', 'PAG', 'PAGAMENTO', 'PAGTO',
  'MB', 'WAY', 'MBWAY', 'LEV', 'CARTAO', 'CRT', 'TPA', 'POS', 'SEPA', 'DE', 'DA', 'DO', 'PARA', 'P', 'REF', 'NR', 'N',
  'FATURA', 'FACTURA', 'LDA', 'SA', 'UNIP', 'UNIPESSOAL', 'PT', 'LISBOA', 'PORTO',
]);

/**
 * Chave do comerciante/contraparte (palavras significativas), usada para aprender regras
 * a partir das correções do utilizador. Ex.: "COMPRA 1234 GALP ENERGIA PORTO 12/03" → "GALP ENERGIA".
 */
export function merchantKey(description: string, maxWords = 2): string {
  const words = normalizeDescription(description)
    .split(' ')
    .filter((w) => w.length > 1 && !/\d/.test(w) && !NOISE.has(w));
  return words.slice(0, maxWords).join(' ');
}

/**
 * Impressão digital de um movimento. `occurrence` distingue movimentos idênticos no mesmo extrato
 * (reimportar o mesmo ficheiro não duplica; dois movimentos iguais no mesmo ficheiro mantêm-se).
 */
export function transactionFingerprint(t: { bookingDate: string; amountCents: number; description: string }, occurrence = 1): string {
  return sha256Hex(`${t.bookingDate}|${t.amountCents}|${normalizeDescription(t.description)}|${occurrence}`);
}
