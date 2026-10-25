import { auditLogs, type Executor } from '@somar/db';

export type ActorType = 'user' | 'accountant' | 'system' | 'ai' | 'admin';

export interface AuditEntry {
  accountId?: string | null;
  actorUserId?: string | null;
  actorType?: ActorType;
  action: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
  ip?: string | null;
}

/** Regista uma ação no registo de auditoria (append-only). */
export async function audit(exec: Executor, entry: AuditEntry): Promise<void> {
  await exec.insert(auditLogs).values({
    accountId: entry.accountId ?? null,
    actorUserId: entry.actorUserId ?? null,
    actorType: entry.actorType ?? 'user',
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    data: entry.data,
    ip: entry.ip ?? null,
  });
}
