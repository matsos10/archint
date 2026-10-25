import { isAppError } from '@somar/core';
import { ZodError } from 'zod';

export interface ActionState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  message?: string;
}

/** Converte erros de domínio/validação em estado de formulário (nunca expõe detalhes internos). */
export function toActionError(e: unknown): ActionState {
  if (isAppError(e)) return { error: e.message };
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) {
      const key = issue.path.join('.') || 'form';
      fieldErrors[key] ??= issue.message;
    }
    return { error: 'Revê os campos assinalados.', fieldErrors };
  }
  // Os redirects do Next.js são exceções que têm de continuar a propagar.
  if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_')) throw e;
  console.error(e);
  return { error: 'Ocorreu um erro inesperado. Tenta novamente.' };
}
