import 'server-only';
import { defaultInvoicingProvider, defaultMailer, defaultStorage } from '@somar/core';
import { getParams, todayIso } from './tax';

export async function invoicingDeps() {
  const loaded = await getParams();
  const today = todayIso();
  return { provider: defaultInvoicingProvider(), storage: defaultStorage(), mailer: defaultMailer(), params: loaded.resolve(Number(today.slice(0, 4))), today };
}

export const DOC_LABEL: Record<string, string> = { FT: 'Fatura', FR: 'Fatura-recibo', FS: 'Fatura simplificada', NC: 'Nota de crédito' };
