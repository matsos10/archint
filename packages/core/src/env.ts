import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL obrigatório'),
  DATABASE_URL_UNPOOLED: z.string().optional(),
  ENCRYPTION_KEYS: z.string().min(1, 'ENCRYPTION_KEYS obrigatório'),
  STORAGE_DIR: z.string().default('./data/files'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;
export function env(): Env {
  cached ??= envSchema.parse(process.env);
  return cached;
}
