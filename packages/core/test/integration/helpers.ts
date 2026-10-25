import { connectTestDb, truncateAll } from '@somar/db/testing';
import { plans, type DbHandle } from '@somar/db';
import { createAccount, sha256Hex, signUp } from '../../src';

export async function freshDb(): Promise<DbHandle> {
  const h = connectTestDb();
  await truncateAll(h);
  await h.db.insert(plans).values({ code: 'gratuito', name: 'Gratuito' });
  return h;
}

let counter = 0;
export async function makeUserWithAccount(h: DbHandle, name = 'Ana') {
  counter++;
  const email = `${name.toLowerCase()}${counter}@exemplo.pt`;
  const { userId, token } = await signUp(h.db, { email, password: 'palavra-passe-1', name }, { ip: `10.0.0.${counter}` });
  const account = await createAccount(h.db, userId, {
    name: `${name} Design`,
    legalForm: 'trabalhador_independente',
    nif: '123456789',
    vatRegime: 'normal_trimestral',
    incomeTaxRegime: 'irs_simplificado',
    activityStartDate: '2023-03-01',
    mainIncomeType: 'servicos_tabela_151',
  }, { sessionId: sha256Hex(token) });
  return { userId, email, token, accountId: account.id };
}

/** O Drizzle embrulha o erro do Postgres; a mensagem original fica em `cause`. */
export async function expectDbError(p: Promise<unknown>, re: RegExp) {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    const msg = `${err.message} ${err.cause?.message ?? ''}`;
    if (!re.test(msg)) throw new Error(`Erro inesperado: ${msg}`);
    return;
  }
  throw new Error('Era esperado um erro da base de dados');
}
