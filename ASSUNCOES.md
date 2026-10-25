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
| 19 | Fonte dos parâmetros fiscais | `params/2025.json` e `params/2026.json` → tabela `tax_parameter_sets` (versão publicada mais recente por ano); edição só por novas versões na área `/admin/parametros` | Nunca fixos no código; cada declaração guarda o `param_set_id` usado. | 2 |
| 20 | Escalões IRS 2025 | Lei n.º 55-A/2025 (12,5% … 48%; limites 8 059 … 83 696 €) | Valores conhecidos à data; **a confirmar**. | 2 |
| 21 | Escalões IRS 2026 | Proposta de OE2026: limites +3,51%, taxas do 2.º ao 5.º escalão −0,3 p.p. | **Estimativa**; confirmar na Lei do OE2026 publicada. | 2 |
| 22 | IAS 2026 | 537,13 € | **Estimativa**; confirmar a portaria. Afeta limites da Segurança Social e a dedução específica (8,54 × IAS). | 2 |
| 23 | Retenção na fonte cat. B | 23% (art. 151.º), 11,5% (outros serviços), 16,5% (propriedade intelectual); dispensa até 15 000 € | OE2025; **a confirmar** para 2026. | 2 |
| 24 | Justificação dos 15% | Aplica-se aos coeficientes 0,75 e 0,35; conta max(dedução específica, contribuições SS) + despesas e-fatura (base + IVA não dedutível) + pessoal + rendas + imóveis + quotas; com categoria A, a dedução automática não é usada | Interpretação do art. 31.º, n.ºs 13–14 CIRS; **a confirmar**. | 2 |
| 25 | Mínimo de existência | Versão simplificada: o imposto não reduz o rendimento coletável abaixo do mínimo, quando predominam rendimentos da cat. A ou do art. 151.º | O art. 70.º atual tem fórmula própria; estimativa conservadora. | 2 |
| 26 | Tributação | Individual, sem quociente conjugal; deduções à coleta: gerais, saúde, educação, dependentes | Simplificação do MVP; o simulador oficial da AT é a referência. | 2 |
| 27 | Isenção de SS no início | Contribuições a partir do 12.º mês posterior ao início (os 12 primeiros meses isentos); declarações trimestrais só quando fixam a base de meses não isentos | Art. 157.º/164.º CRC; **a confirmar**. | 2 |
| 28 | Contribuição mínima SS | 20 € quando o rendimento relevante é positivo; 0 € sem rendimentos | Art. 168.º CRC. | 2 |
| 29 | Prazos IVA | Declaração até dia 20 e pagamento até dia 25 do 2.º mês após o período | Arts. 41.º e 27.º CIVA (redação recente); **a confirmar**. | 2 |
| 30 | Comunicação de faturas | Dia 5 do mês seguinte; marcada como automática (software certificado) | DL 198/2012; **confirmar o dia em vigor**. | 2 |
| 31 | Taxa reduzida de IVA da Madeira | 4% | **A confirmar** (4% vs 5%). | 2 |
| 32 | Obrigações anteriores à adesão | Não são geradas (prazo < data de onboarding) | Evita falsos "em atraso" numa conta nova; histórico importado não gera prazos. | 2 |
| 33 | IRC 2026 | Taxa geral 19%, PME 15% nos primeiros 50 000 €; derrama municipal 1,5% por omissão | Previsto no OE2026; **a confirmar**; derrama varia por município. | 2 |
| 34 | Fixture de referência | ENI fictícia "Marta Ferreira — Design Gráfico", 2025, 8 faturas, 93 movimentos | Cálculos à mão em `fixtures/eni-simplificado-2025/README.md`. | 2 |
