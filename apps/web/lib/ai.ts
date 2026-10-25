import 'server-only';
import { defaultLlmClient, type LlmClient } from '@somar/ai';
import { llmForAccount } from '@somar/core';
import type { TenantTx } from '@somar/db';

let client: LlmClient | null | undefined;
export function globalLlm() {
  if (client === undefined) client = defaultLlmClient();
  return client;
}

/** Cliente de IA para a conta (null se a IA estiver desligada ou indisponível). */
export function accountLlm(tx: TenantTx, accountId: string) {
  return llmForAccount(tx, accountId, globalLlm());
}
