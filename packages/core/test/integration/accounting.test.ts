import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { bankAccounts, bankConnections, categories, categorizationRules, insights, jobs, receipts, transactions, withTenant, type DbHandle } from '@somar/db';
import {
  LocalEncryptedStorage,
  MockAggregator,
  completeBankLink,
  correctCategory,
  importTransactions,
  parseKeyring,
  refreshInsights,
  startBankLink,
  syncBankConnection,
  uploadReceipt,
} from '../../src';
import { freshDb, makeUserWithAccount } from './helpers';

let h: DbHandle;
beforeEach(async () => {
  h?.close();
  h = await freshDb();
});
afterAll(async () => h?.close());

async function bank(accountId: string) {
  return withTenant(h.db, accountId, async (tx) => (await tx.insert(bankAccounts).values({ accountId, source: 'manual', name: 'Banco' }).returning())[0]!.id);
}

describe('ligação bancária (open banking, agregador simulado)', () => {
  it('liga o banco, cria a conta, sincroniza e não duplica numa segunda sincronização', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const agg = new MockAggregator();
    const { connectionId, link } = await startBankLink(h.db, agg, { accountId: a.accountId, userId: a.userId }, { institutionId: 'SOMAR_BANCO_DEMO', redirectUrl: 'http://localhost/app/bancos/retorno' });
    expect(link).toContain(`connection=${connectionId}`);
    const [conn] = await withTenant(h.db, a.accountId, (tx) => tx.select().from(bankConnections));
    expect(conn!.externalRefEnc).not.toContain('mock-'); // referência encriptada

    expect(await completeBankLink(h.db, agg, { accountId: a.accountId }, connectionId)).toEqual({ status: 'linked', accounts: 1 });
    const queued = await withTenant(h.db, a.accountId, (tx) => tx.select().from(jobs));
    expect(queued.map((j) => j.type)).toEqual(['bank.sync']);

    const r1 = await syncBankConnection(h.db, agg, a.accountId, connectionId);
    expect(r1[0]!.imported).toBe(2);
    // Força uma nova leitura completa: os movimentos já existentes são ignorados pelo id externo
    await withTenant(h.db, a.accountId, (tx) => tx.update(bankConnections).set({ lastSyncedAt: null }));
    const r2 = await syncBankConnection(h.db, agg, a.accountId, connectionId);
    expect(r2[0]).toMatchObject({ imported: 0, skipped: 2 });
    expect(await withTenant(h.db, a.accountId, (tx) => tx.select().from(transactions))).toHaveLength(2);
    const accs = await withTenant(h.db, a.accountId, (tx) => tx.select().from(bankAccounts));
    expect(accs[0]).toMatchObject({ source: 'open_banking', ibanLast4: '0154' });
    expect(accs[0]!.ibanEnc).not.toContain('PT50');
  });
});

describe('aprendizagem a partir das correções', () => {
  it('a correção cria uma regra da conta e é aplicada a movimentos semelhantes', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const b = await bank(a.accountId);
    await withTenant(h.db, a.accountId, (tx) =>
      importTransactions(tx, { accountId: a.accountId }, b, [
        { bookingDate: '2025-03-01', description: 'COMPRA LIVRARIA BERTRAND', amountCents: -2500 },
        { bookingDate: '2025-04-01', description: 'COMPRA LIVRARIA BERTRAND CHIADO', amountCents: -1800 },
        { bookingDate: '2025-04-02', description: 'COMPRA GALP COMBUSTIVEL', amountCents: -6000 },
      ]),
    );
    await withTenant(h.db, a.accountId, async (tx) => {
      const [formacao] = await tx.select().from(categories).where(eq(categories.code, 'formacao'));
      const [first] = await tx.select().from(transactions).where(eq(transactions.bookingDate, '2025-03-01'));
      expect(first!.categoryId).toBeNull();
      const r = await correctCategory(tx, a.accountId, first!.id, formacao!.id);
      expect(r.learnedPattern).toBe('LIVRARIA BERTRAND');
      const all = await tx.select().from(transactions).orderBy(transactions.bookingDate);
      expect(all.map((t) => [t.categoryId === formacao!.id, t.categorySource])).toEqual([
        [true, 'user'],
        [true, 'rule'],
        [false, 'rule'],
      ]);
      const rules = await tx.select().from(categorizationRules);
      expect(rules).toHaveLength(1);
    });
  });
});

describe('justificativos e alertas', () => {
  it('guarda o ficheiro encriptado, lê o QR da AT e resolve o alerta ao associar', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const b = await bank(a.accountId);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'somar-files-'));
    const storage = new LocalEncryptedStorage(dir, parseKeyring('1=' + Buffer.alloc(32, 3).toString('base64')));
    await withTenant(h.db, a.accountId, (tx) =>
      importTransactions(tx, { accountId: a.accountId }, b, [{ bookingDate: '2020-05-14', description: 'COMPRA GALP COMBUSTIVEL', amountCents: -6150 }]),
    );
    await withTenant(h.db, a.accountId, (tx) => refreshInsights(tx, a.accountId));
    const before = await withTenant(h.db, a.accountId, (tx) => tx.select().from(insights).where(eq(insights.code, 'missing_receipt')));
    expect(before[0]!.status).toBe('open');

    const content = Buffer.from('%PDF-1.4 talão de teste');
    const r = await withTenant(h.db, a.accountId, (tx) =>
      uploadReceipt(tx, storage, { accountId: a.accountId, userId: a.userId }, { name: 'talao.pdf', mimeType: 'application/pdf', data: content }, {
        qrPayload: 'A:506012344*B:123456789*C:PT*D:FS*E:N*F:20200514*G:FS 1/1*H:ABC-1*I1:PT*I7:50.00*I8:11.50*N:11.50*O:61.50*Q:abcd*R:1',
      }),
    );
    expect(r).toMatchObject({ status: 'extracted', supplierNif: '506012344', totalCents: 6150, vatCents: 1150, documentDate: '2020-05-14' });
    // Ficheiro em disco encriptado (não contém o texto original) e recuperável
    const files = readdirSync(path.join(dir, a.accountId, 'receipts'));
    const raw = readFileSync(path.join(dir, a.accountId, 'receipts', files[0]!));
    expect(raw.includes(Buffer.from('talão'))).toBe(false);

    await withTenant(h.db, a.accountId, (tx) => importTransactions(tx, { accountId: a.accountId }, b, []));
    const [linked] = await withTenant(h.db, a.accountId, (tx) => tx.select().from(receipts));
    expect(linked!.status).toBe('matched');
    const after = await withTenant(h.db, a.accountId, (tx) => tx.select().from(insights).where(and(eq(insights.code, 'missing_receipt'))));
    expect(after[0]!.status).toBe('resolved');
    expect((await storage.get(r.fileId ? (await withTenant(h.db, a.accountId, (tx) => tx.query.files.findFirst()))!.storageKey : '')).equals(content)).toBe(true);
  });

  it('rejeita formatos não suportados', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const storage = new LocalEncryptedStorage(mkdtempSync(path.join(os.tmpdir(), 'somar-')), parseKeyring('1=' + Buffer.alloc(32, 3).toString('base64')));
    await expect(
      withTenant(h.db, a.accountId, (tx) => uploadReceipt(tx, storage, { accountId: a.accountId, userId: a.userId }, { name: 'x.exe', mimeType: 'application/x-msdownload', data: Buffer.from('x') })),
    ).rejects.toThrow(/Formato/);
  });
});
