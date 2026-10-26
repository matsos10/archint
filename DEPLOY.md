# Deploy do Somar (VPS Contabo + Docker + Nginx Proxy Manager + Neon)

> O Somar apoia, mas não substitui um contabilista certificado. O utilizador é responsável pelas declarações que submete.

## Arquitetura

```
Internet ──TLS──▶ Nginx Proxy Manager (já instalado no VPS, fora deste stack)
                        │  rede Docker partilhada (ex.: npm_proxy)
                        ▼
                 somar-web (Next.js, porta interna 3000)
                 somar-worker (fila de trabalhos: OCR, banco, PDF, lembretes)
                 somar-migrate (one-shot: migrations + seeds, corre antes dos outros)
                        │  SSL + pooling
                        ▼
                 Neon (PostgreSQL serverless, gerido externamente)

Volume Docker "files" → /data/files (ficheiros encriptados AES-256-GCM)
```

Não existe container de Postgres. A app não publica portas no host: só o NPM a alcança pela rede partilhada.

## 1. Pré-requisitos no VPS

- Docker Engine ≥ 24 e Docker Compose v2 (`docker compose version`).
- Nginx Proxy Manager a correr em Docker, com um domínio a apontar para o VPS (registo A/AAAA).
- Descobrir a rede Docker do NPM:

  ```bash
  docker inspect <container-do-npm> --format '{{json .NetworkSettings.Networks}}'
  ```

  Se o NPM estiver na rede por omissão do seu compose (ex.: `npm_default`), usa esse nome em `PROXY_NETWORK`.
  Em alternativa, cria uma rede dedicada e liga o NPM a ela:

  ```bash
  docker network create npm_proxy
  docker network connect npm_proxy <container-do-npm>
  ```

## 2. Neon

1. Cria um projeto no Neon na região **AWS Europe (Frankfurt) `eu-central-1`** (dados na UE, RGPD).
2. Cria dois branches/bases: `prod` e `dev` (ambientes separados, credenciais diferentes).
3. Em *Connection Details*, copia para cada ambiente:
   - a ligação **pooled** (host com `-pooler`) → `DATABASE_URL`;
   - a ligação **direta** (sem `-pooler`) → `DATABASE_URL_UNPOOLED` (usada só pelas migrations).
   Ambas com `?sslmode=require&channel_binding=require`.
4. Usa o papel dono da base (ex.: `neondb_owner`). As migrations criam o papel `somar_app` (sem login, sujeito a
   Row Level Security) usado para todas as queries de dados de conta.

## 3. Configuração

```bash
git clone <repo> /opt/somar && cd /opt/somar
cp .env.example .env
chmod 600 .env
# gerar a chave de encriptação:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # ou: openssl rand -base64 32
nano .env   # APP_URL, DATABASE_URL, DATABASE_URL_UNPOOLED, ENCRYPTION_KEYS=1=<chave>, PROXY_NETWORK
```

**Guarda `ENCRYPTION_KEYS` num cofre fora do VPS.** Sem ela, os ficheiros e campos encriptados são irrecuperáveis.

## 4. Arranque

```bash
docker compose up -d --build
docker compose ps            # migrate: Exited (0); web e worker: Up (healthy)
docker compose logs migrate  # "[db] migrations aplicadas" / "[db] seeds aplicados"
docker compose exec web wget -qO- http://127.0.0.1:3000/api/health
# {"status":"ok","db":"ok","ssl":true,...}
```

> Build atrás de um proxy com CA própria: `docker build --secret id=extra_ca,src=/caminho/ca.crt ...`
> (o secret é opcional e não fica na imagem).

## 5. Proxy Host no Nginx Proxy Manager

Em *Hosts → Proxy Hosts → Add Proxy Host*:

| Separador | Campo | Valor |
|---|---|---|
| Details | Domain Names | `app.teudominio.pt` |
| | Scheme | `http` |
| | Forward Hostname / IP | `somar-web-1` (nome do container; confirma com `docker compose ps`) |
| | Forward Port | `3000` |
| | Cache Assets | desligado |
| | Block Common Exploits | ligado |
| | Websockets Support | ligado |
| SSL | SSL Certificate | *Request a new SSL Certificate* (Let's Encrypt) |
| | Force SSL | ligado |
| | HTTP/2 Support | ligado |
| | HSTS Enabled | ligado |
| Advanced | Custom Nginx Configuration | ver abaixo |

```nginx
client_max_body_size 15m;          # upload de justificativos
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 120s;
```

Confirma em `https://app.teudominio.pt/api/health`.

## 5.1 Stripe (planos pagos)

1. No Stripe (modo *live*), cria os produtos **Plus** e **Pro**, cada um com um preço mensal e um anual
   (com IVA incluído, ver `ASSUNCOES.md`). Copia os IDs `price_…` para `STRIPE_PRICE_PLUS_MONTHLY`,
   `STRIPE_PRICE_PLUS_YEARLY`, `STRIPE_PRICE_PRO_MONTHLY` e `STRIPE_PRICE_PRO_YEARLY` no `.env`.
2. *Developers → API keys*: chave secreta restrita em `STRIPE_SECRET_KEY`.
3. *Developers → Webhooks → Add endpoint*: `https://app.teudominio.pt/api/stripe/webhook`, com os eventos
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted` e `invoice.payment_failed`. Copia o *signing secret* para
   `STRIPE_WEBHOOK_SECRET`.
4. *Settings → Billing → Customer portal*: ativa mudança de plano (Plus ↔ Pro, mensal ↔ anual),
   atualização do cartão, faturas e cancelamento no fim do período.
5. Reinicia (`docker compose up -d`): o serviço `migrate` volta a correr os seeds e grava os IDs de
   preço nos planos. Sem estas variáveis, os planos pagos aparecem mas o checkout fica indisponível.
6. **Antes de cobrar**: os recibos do Stripe não são faturas certificadas pela AT; ver `ASSUNCOES.md`
   (emissão da fatura de cada pagamento num software certificado).

Teste local dos webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## 5.2 Contabilistas parceiros

Os contabilistas criam o perfil em `/contabilista/perfil`. Um administrador da plataforma
(`users.is_platform_admin`) confirma a inscrição na lista pública da Ordem dos Contabilistas
Certificados e verifica-o em `/admin/contabilistas`; só depois aparece no diretório.

## 6. Atualizações e rollback

```bash
cd /opt/somar && git pull
TAG=$(git rev-parse --short HEAD) docker compose up -d --build   # migrate corre primeiro
# rollback: TAG=<tag-anterior> docker compose up -d --no-build
```

As migrations são aditivas; antes de uma migration destrutiva, cria um branch de backup no Neon
(*Branches → Create branch* a partir de `prod`).

## 7. Backups

- Base de dados: point-in-time restore do Neon (verifica a janela de retenção do plano).
- Ficheiros (já encriptados):

  ```bash
  docker run --rm -v somar_files:/data -v /opt/backups:/backup alpine \
    tar czf /backup/files-$(date +%F).tgz -C /data .
  ```

  Copia para fora do VPS (ex.: storage S3-compatível). Ver `ASSUNCOES.md` sobre a migração futura para S3.

## 8. Ambiente de desenvolvimento

```bash
pnpm install
cp .env.example .env.local   # aponta para o branch "dev" do Neon
pnpm db:migrate && pnpm db:seed
pnpm dev            # http://localhost:3000
pnpm dev:worker
pnpm test           # testes (integração precisa de TEST_DATABASE_URL com papel não superutilizador)
```

Stack completo em local, com a porta publicada:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## 9. Checklist de segurança

- [ ] `.env` com `chmod 600`, fora do Git; `ENCRYPTION_KEYS` guardada num cofre.
- [ ] Credenciais Neon distintas para dev e prod; IP allowlist do Neon com o IP do VPS (opcional, planos pagos).
- [ ] Firewall do VPS: só 22, 80 e 443 abertos (a porta 3000 nunca é publicada).
- [ ] Force SSL + HSTS no NPM.
- [ ] Backups do volume `files` testados (restauro).
- [ ] `STRIPE_WEBHOOK_SECRET` configurado (sem ele o webhook responde 503 e nenhum plano é ativado).
- [ ] Papel `somar_readonly` criado pela migration 0005 (acesso de consulta dos contabilistas).
