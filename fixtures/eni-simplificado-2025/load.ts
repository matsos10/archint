import { clients, documentLines, files, invoices, receipts, withTenant, type Db } from '@somar/db';
import { fixture } from './index';

/**
 * Carrega na base de dados as faturas já emitidas (como importadas de outro software certificado)
 * e os justificativos tal como o OCR os extrairia. O extrato bancário é importado pelo fluxo normal.
 */
export async function loadFixtureDocuments(db: Db, accountId: string) {
  return withTenant(db, accountId, async (tx) => {
    const clientIds = new Map<string, string>();
    for (const c of fixture.clients) {
      const [row] = await tx
        .insert(clients)
        .values({ accountId, name: c.name, nif: c.nif, email: c.email, isCompany: c.isCompany, hasOrganizedAccounting: c.hasOrganizedAccounting })
        .returning({ id: clients.id });
      clientIds.set(c.key, row!.id);
    }
    for (const i of fixture.invoices) {
      const client = fixture.clients.find((c) => c.key === i.client)!;
      const [inv] = await tx
        .insert(invoices)
        .values({
          accountId,
          docType: 'FT',
          number: i.number,
          sequence: i.sequence,
          status: 'issued',
          clientId: clientIds.get(i.client),
          clientSnapshot: { name: client.name, nif: client.nif },
          issueDate: i.issueDate,
          dueDate: i.dueDate,
          netCents: i.netCents,
          vatCents: i.vatCents,
          withholdingCents: i.withholdingCents,
          totalCents: i.totalCents,
          provider: 'externo',
          issuedAt: new Date(i.issueDate),
        })
        .returning({ id: invoices.id });
      await tx.insert(documentLines).values(
        i.lines.map((l, idx) => ({
          accountId,
          invoiceId: inv!.id,
          position: idx + 1,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          vatRateCode: 'normal' as const,
          vatRatePct: l.vatRatePct,
          netCents: i.netCents,
          vatCents: i.vatCents,
        })),
      );
    }
    for (const r of fixture.receipts) {
      const [f] = await tx
        .insert(files)
        .values({ accountId, kind: 'receipt', storageKey: `${accountId}/receipts/${r.transactionId}.pdf`, mimeType: 'application/pdf', sizeBytes: 1000, sha256: r.transactionId.padEnd(64, '0') })
        .returning({ id: files.id });
      await tx.insert(receipts).values({
        accountId,
        fileId: f!.id,
        status: 'extracted',
        supplierName: r.supplierName,
        supplierNif: r.supplierNif,
        documentNumber: r.documentNumber,
        atcud: r.atcud,
        documentDate: r.documentDate,
        totalCents: r.totalCents,
        vatCents: r.vatCents,
        extracted: { fixtureTransactionId: r.transactionId },
        extractionConfidence: 0.95,
      });
    }
  });
}
