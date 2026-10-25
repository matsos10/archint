import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { parseTaxParams } from '@somar/tax-engine';
import params2025 from '@somar/tax-engine/params/2025.json';
import params2026 from '@somar/tax-engine/params/2026.json';
import categoryCatalog from '../seed-data/categories.json';
import type { Db } from './client';
import { categories, plans, taxParameterSets } from './schema';

/**
 * Dados de referência idempotentes (planos, categorias de sistema, parâmetros fiscais).
 * Cada fase acrescenta os seus seeds; correr várias vezes não duplica nada.
 */
export interface Seeder {
  name: string;
  run: (db: Db) => Promise<void>;
}

export const basePlans: Seeder = {
  name: 'plans',
  run: async (db) => {
    const rows = [
      {
        code: 'gratuito',
        name: 'Gratuito',
        priceMonthlyCents: 0,
        priceYearlyCents: 0,
        sortOrder: 0,
        aiMonthlyQuota: 30,
        features: ['contabilidade_basica', 'categorizacao', 'despesas', 'faturacao'],
      },
    ];
    for (const r of rows) {
      await db
        .insert(plans)
        .values(r)
        .onConflictDoUpdate({ target: plans.code, set: { name: r.name, features: r.features, sortOrder: r.sortOrder } });
    }
  },
};

/**
 * Parâmetros fiscais: cria a versão 1 (publicada) de cada ano se ainda não existir nenhuma versão.
 * Alterações posteriores fazem-se por novas versões na área de administração (nunca por código).
 */
export const taxParameters: Seeder = {
  name: 'tax-parameters',
  run: async (db) => {
    for (const raw of [params2025, params2026]) {
      const params = parseTaxParams(raw);
      const existing = await db.select({ id: taxParameterSets.id }).from(taxParameterSets).where(eq(taxParameterSets.year, params.year));
      if (existing.length) continue;
      await db.insert(taxParameterSets).values({
        year: params.year,
        version: 1,
        status: 'published',
        params: params as unknown as Record<string, unknown>,
        notes: 'Versão inicial (seed). Valores marcados "verify" a confirmar nas fontes oficiais.',
        publishedAt: new Date(),
      });
    }
  },
};

/** Categorias de sistema (account_id NULL), partilhadas por todas as contas. */
export const systemCategories: Seeder = {
  name: 'system-categories',
  run: async (db) => {
    for (const c of categoryCatalog) {
      const values = {
        code: c.code,
        name: c.name,
        kind: c.kind as 'income',
        deductible: c.deductible,
        deductiblePct: c.deductiblePct,
        defaultVatRate: (c.defaultVatRate ?? null) as 'normal' | null,
        vatDeductionKey: c.vatDeductionKey,
        vatBucket: c.vatBucket,
        requiresReceipt: c.requiresReceipt,
        sncAccount: c.sncAccount,
        irsIncomeType: (c.irsIncomeType ?? null) as 'vendas' | null,
        legalNote: c.legalNote,
        isSystem: true,
      };
      const [row] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(isNull(categories.accountId), eq(categories.code, c.code)));
      if (row) await db.update(categories).set(values).where(eq(categories.id, row.id));
      else await db.insert(categories).values({ ...values, accountId: null });
    }
  },
};

export const seeders: Seeder[] = [basePlans, taxParameters, systemCategories];

export async function runSeeders(db: Db, list: Seeder[] = seeders) {
  for (const s of list) {
    await s.run(db);
  }
  await db.execute(sql`select 1`);
}
