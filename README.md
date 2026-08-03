# Aion Engenharia Clínica — Monorepo

Sistema de Gestão de Engenharia Clínica (desktop + PWA de campo).
Produto: **Aion Engenharia Clínica** · desenvolvido por **Bluebeaver**.

## Estrutura

```
apps/api     NestJS + Prisma + PostgreSQL
apps/web     Next.js (shell desktop + /mobile PWA)
packages/shared   tipos e regras compartilhadas
```

## Pré-requisitos locais

- Node.js 20+ (ou use `.tools/node-v22.17.0-darwin-arm64` no PATH)
- pnpm 10 (`corepack enable && corepack prepare pnpm@10.14.0 --activate`)
- Docker (opcional, para Postgres / Coolify-like)

```bash
cp .env.example .env
pnpm install
pnpm --filter @aion/shared build
pnpm db:generate
# com Postgres no ar:
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:3000  
- API: http://localhost:3001/api/health  
- Mobile: http://localhost:3000/mobile  

### Usuários seed

| E-mail | Senha | Perfil |
|--------|-------|--------|
| engenheiro@aion.local | aion1234 | Engenheiro |
| tecnico@aion.local | aion1234 | Técnico |
| solicitante@aion.local | aion1234 | Solicitante |

No boot da API (`scripts/start-prod.mjs`) rodam automaticamente:

1. `prisma migrate deploy`
2. seed demo se não houver usuários (`SEED_ON_BOOT=true` força de novo)
3. sobe a API e, em background, retoma o import de `equipamentos-reais.json` até completar as 394 tags (`IMPORT_EQUIPAMENTOS_ON_BOOT=true` força)

Não é necessário executar comandos manuais no Railway.

## Fases entregues (MVP)

1. **Núcleo operacional** — Auth, shell, cadastros, equipamentos, OS, estoque, portal/triagem  
2. **Conformidade técnica** — Laudos, procedimentos, instrumentos, certificados, ficha vida  
3. **Gestão de suporte** — Contratos, pessoas/equipes, componentes recuperados, quadro Kanban  
4. **Estratégico + mobile** — Maturidade, dashboard executivo, indicadores, auditorias/NC, PWA com sync IndexedDB  
5. **Complementar** — Financeiro agregado, CAPEX/substituição/plano diretor, relatórios **PDF (pdfkit) + Excel (exceljs)**, configurações  

## Deploy no Coolify (recomendado)

Use **Docker Compose** apontando para `docker-compose.yml` na raiz.

1. Crie um recurso **Docker Compose** no Coolify com este repositório.
2. Defina as variáveis (mínimo):
   - `POSTGRES_PASSWORD`
   - `JWT_SECRET` (longo e aleatório)
   - `DATABASE_URL=postgresql://aion:<senha>@db:5432/aion?schema=public`
   - `CORS_ORIGIN` / `WEB_ORIGIN` = URL pública do front
   - `NEXT_PUBLIC_API_URL` = URL pública da API (build arg + runtime)
3. Publique as portas / domínios:
   - `web` → domínio principal
   - `api` → subdomínio `api.` (ou path proxy)
4. Após o primeiro boot da API (`prisma migrate deploy`), rode o seed uma vez:

```bash
docker compose exec api pnpm prisma:seed
```

O compose sobe `db` + `api` + `web`. A API aplica migrations no start.

## Deploy no Railway

Dois serviços a partir da **raiz do monorepo** (Root Directory vazio).

| Serviço | Package (Railway) | Dockerfile |
|---------|-------------------|------------|
| Web | `@nexo/web` | `apps/web/Dockerfile` |
| API | `@nexo/api` | `apps/api/Dockerfile` |

Os nomes `@nexo/web` / `@nexo/api` são só o **package name** do monorepo (Railway já aponta para eles). A marca do produto continua **Aion**; o shared é `@aion/shared`.

Preferível: build via Dockerfile (CMD já inicia a app). Se usar Nixpacks/custom start:

```bash
pnpm --filter @nexo/web start
pnpm --filter @nexo/api start
```

**Não** use `@aion/web` / `@aion/api` no filtro do Railway — esses nomes não existem como package.

## Docs de produto

- `HANDOFF-Cursor.md`
- `Especificacao-Tecnica-Aion.md`
- `design_handoff_nexo/` (protótipos)
