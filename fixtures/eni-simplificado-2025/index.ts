/**
 * Caso de referência: ENI no regime simplificado, IVA trimestral, ano de 2025.
 * Ver README.md para os cálculos feitos à mão que servem de resultado esperado.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import account from './conta.json';
import clients from './clientes.json';
import invoices from './faturas.json';
import receipts from './justificativos.json';
import truth from './categorizacao-esperada.json';
import previousYear from './ano-anterior.json';

const dir = path.dirname(fileURLToPath(import.meta.url));

export const fixture = {
  account,
  clients,
  invoices,
  receipts,
  truth,
  previousYear,
  bankCsv: () => readFileSync(path.join(dir, 'extrato-bancario-2025.csv'), 'utf8'),
};

export type FixtureInvoice = (typeof invoices)[number];
export type FixtureReceipt = (typeof receipts)[number];
export type FixtureTruth = (typeof truth)[number];
