/** Erro de domínio com mensagem pronta a mostrar ao utilizador (pt-PT). */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
