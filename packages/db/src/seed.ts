import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from './client';
import { plans } from './schema';

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

export const seeders: Seeder[] = [basePlans];

export async function runSeeders(db: Db, list: Seeder[] = seeders) {
  for (const s of list) {
    await s.run(db);
  }
  await db.execute(sql`select 1`);
}
