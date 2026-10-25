# Somar

Contabilidade online para trabalhadores independentes e pequenas empresas em Portugal: contabilidade automatizada,
faturação, declarações fiscais e acompanhamento por contabilistas certificados parceiros.

> **Aviso:** o Somar apoia, mas não substitui um contabilista certificado. O utilizador é responsável pelas declarações
> que submete. Os parâmetros fiscais devem ser confirmados nas fontes oficiais (Portal das Finanças, Segurança Social).

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `apps/web` | Next.js (App Router) — UI e API |
| `apps/worker` | Worker de fila (sincronização bancária, OCR, PDF, lembretes) |
| `packages/db` | Schema Drizzle, migrations SQL (incl. RLS), seeds |
| `packages/core` | Serviços de servidor: auth/2FA, cripto, armazenamento, contas, fila |
| `packages/tax-engine` | Motor fiscal em TypeScript puro (sem UI nem IA) |
| `packages/ai` | Camada de IA (propõe; o motor valida; o utilizador confirma) |
| `fixtures/` | Caso de referência (ENI, regime simplificado, IVA trimestral) |
| `apps/archint-planner` | App anterior do repositório (não relacionada, fora do workspace) |

## Desenvolvimento

```bash
pnpm install
pnpm db:migrate && pnpm db:seed     # DATABASE_URL / DATABASE_URL_UNPOOLED
pnpm dev                            # http://localhost:3000
pnpm test                           # unitários + integração (TEST_DATABASE_URL)
```

Os testes de integração usam um Postgres real com um papel **não** superutilizador (como no Neon), para que a RLS
seja efetiva. Por omissão: `postgres://dev:dev@localhost:5432/contas_test`.

Deploy: ver [`DEPLOY.md`](DEPLOY.md). Decisões e assunções: ver [`ASSUNCOES.md`](ASSUNCOES.md).
