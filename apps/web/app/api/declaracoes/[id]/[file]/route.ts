import { and, eq } from 'drizzle-orm';
import { declarations, withTenant } from '@somar/db';
import { audit, type DeclarationData } from '@somar/core';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';

/** Descarrega um ficheiro de apoio de uma declaração (CSV, JSON, XML). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const ctx = await requireAccount();
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\d{1,2}$/.test(file)) return new Response('Não encontrado', { status: 404 });
  const f = await withTenant(getDb(), ctx, async (tx) => {
    const [d] = await tx.select().from(declarations).where(and(eq(declarations.id, id), eq(declarations.accountId, ctx.accountId)));
    const item = (d?.data as unknown as DeclarationData | undefined)?.files[Number(file)];
    if (item) await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'declaration.file_downloaded', entityType: 'declaration', entityId: id, data: { file: item.name } });
    return item;
  });
  if (!f) return new Response('Não encontrado', { status: 404 });
  const bom = f.mimeType === 'text/csv' ? '﻿' : '';
  return new Response(bom + f.content, {
    headers: { 'content-type': `${f.mimeType}; charset=utf-8`, 'content-disposition': `attachment; filename="${f.name}"`, 'cache-control': 'private, no-store' },
  });
}
