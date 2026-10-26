import { and, eq } from 'drizzle-orm';
import { files, withTenant } from '@somar/db';
import { audit, defaultStorage } from '@somar/core';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';

/** Descarrega um ficheiro da conta (desencriptado no servidor; acesso registado na auditoria). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAccount();
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Não encontrado', { status: 404 });
  const f = await withTenant(getDb(), ctx, async (tx) => {
    const [row] = await tx.select().from(files).where(and(eq(files.id, id), eq(files.accountId, ctx.accountId)));
    if (row) await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'file.downloaded', entityType: 'file', entityId: id });
    return row;
  });
  if (!f) return new Response('Não encontrado', { status: 404 });
  const data = await defaultStorage().get(f.storageKey);
  return new Response(new Uint8Array(data), {
    headers: {
      'content-type': f.mimeType,
      'content-disposition': `inline; filename="${encodeURIComponent(f.originalName ?? 'ficheiro')}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
