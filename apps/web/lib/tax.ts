import 'server-only';
import { loadTaxParams } from '@somar/core';
import { getDb } from './db';

export async function getParams() {
  return loadTaxParams(getDb());
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso + 'T00:00:00Z') - Date.parse(fromIso + 'T00:00:00Z')) / 86_400_000);
}
