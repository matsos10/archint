# Assunções

Registo das decisões tomadas sem especificação explícita, para revisão posterior.
Onde há regras fiscais, os valores estão também sinalizados no código/parâmetros e **devem ser validados nas fontes oficiais** (AT, Segurança Social, Diário da República).

| # | Assunção | Valor | Justificação | Fase |
|---|---|---|---|---|
| 1 | Nome provisório do produto | **Somar** (pacotes `@somar/*`) | Verbo simples e português, ligado a contas; sem relação com marcas existentes conhecidas. Validar registo de marca (INPI/EUIPO) e domínio. | 1 |
| 2 | App pré-existente no repositório | Movida para `apps/archint-planner/`, fora do workspace pnpm | O repositório continha uma app Vite não relacionada (planeamento de interiores). Preservada com histórico (`git mv`), sem interferir com o monorepo. | 1 |
| 3 | Gestor de pacotes / estrutura | pnpm workspaces: `apps/web`, `apps/worker`, `packages/{db,core,tax-engine,ai}` | Partilha de código entre web e worker; motor fiscal isolado conforme pedido. | 1 |
| 4 | ORM | Drizzle ORM + drizzle-kit, driver `pg` (node-postgres) | SQL explícito, migrations versionadas em SQL, suporte direto a RLS; `pg` funciona com o pooler do Neon (PgBouncer) e com Postgres local nos testes. | 1 |
| 5 | Isolamento multi-tenant | Filtro `account_id` na aplicação **e** Row Level Security no Postgres (papel `somar_app` via `SET LOCAL ROLE` em cada transação) | Defesa em profundidade: um esquecimento de filtro não expõe dados. `SET LOCAL`/`set_config(..., true)` são compatíveis com o pooler em modo transaction. | 1 |
| 6 | Tabelas de plataforma sem RLS | `users`, `sessions`, `rate_limits`, `plans`, `tax_parameter_sets`, `accountant_partners`, `push_subscriptions`, `data_requests` | Acedidas apenas pelo papel de plataforma (auth, worker, admin). O papel da app só lê colunas não sensíveis de `users`. | 1 |
| 7 | Autenticação | Implementação própria: scrypt (N=2^15) para palavras-passe, tokens de sessão aleatórios guardados como SHA-256, cookie `httpOnly`/`SameSite=Lax`, TOTP RFC 6238 com códigos de recuperação | Poucas dependências, totalmente testável (vetores RFC). Rever se se quiser SSO/OAuth ou WebAuthn (passkeys) numa fase futura. | 1 |
| 8 | Verificação de email | Não obrigatória no MVP (coluna `email_verified_at` preparada) | Sem fornecedor de email configurado na Fase 1. A ativar com o envio de emails (Fase 4). | 1 |
| 9 | Limites de tentativas | Login: 8/15 min por email, 30/15 min por IP; registo 10/h por IP; 2FA 10/15 min | Valores habituais anti-força-bruta, guardados em Postgres (várias instâncias). | 1 |
| 10 | Encriptação em repouso | Neon (encriptação de disco) + AES-256-GCM aplicacional para segredos 2FA, IBAN, referências bancárias e todos os ficheiros | Dados financeiros sensíveis (RGPD). Chaves em `ENCRYPTION_KEYS` com rotação por versão. | 1 |
| 11 | NIF/NIPC | Guardado em claro | É impresso em todas as faturas e necessário em pesquisas; protegido por RLS e encriptação de disco do Neon. | 1 |
| 12 | Fila de trabalhos | Tabela `jobs` em Postgres com `FOR UPDATE SKIP LOCKED`, backoff exponencial | Evita Redis/serviço extra; compatível com o pooler do Neon. | 1 |
| 13 | Migrations em produção | Serviço one-shot `migrate` no compose (imagem do worker) que corre antes de `web`/`worker`, usando a ligação direta do Neon | `docker compose up` arranca do zero de forma determinística. | 1 |
| 14 | Rede do proxy | Rede externa `PROXY_NETWORK` (por omissão `npm_proxy`) | O NPM está fora do stack; o nome real da rede depende da instalação existente (ver DEPLOY.md). | 1 |
| 15 | Teste Docker sem Neon real | Validado contra Postgres 16 com SSL e papel dono **não** superutilizador (como no Neon) | Não há credenciais Neon neste ambiente. Repetir o teste com o branch `dev` do Neon antes da Fase 9. | 1 |
| 16 | Estatutos suportados | Trabalhador independente, ENI, Unipessoal Lda., Lda. | Públicos-alvo indicados. Sociedades anónimas e cooperativas fora do âmbito. | 1 |
| 17 | Regimes no onboarding | Sociedades: sempre IRC e contabilidade organizada; art. 53.º CIVA só para pessoas singulares | Art. 53.º, n.º 1 CIVA exclui quem tenha ou deva ter contabilidade organizada (o caso das sociedades). | 1 |
| 18 | Tipografia e identidade | Geist (pacote npm, sem pedido externo), cor de destaque azul cobalto (azulejo), neutros quentes | Identidade própria, distinta do Indy; fontes locais evitam dependência de rede no build. | 1 |
