# Nexo — Monorepo

Sistema de Gestão de Engenharia Clínica (desktop + PWA de campo).

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
pnpm --filter @nexo/shared build
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
| engenheiro@nexo.local | nexo1234 | Engenheiro |
| tecnico@nexo.local | nexo1234 | Técnico |
| solicitante@nexo.local | nexo1234 | Solicitante |

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
   - `DATABASE_URL=postgresql://nexo:<senha>@db:5432/nexo?schema=public`
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

## Docs de produto

- `HANDOFF-Cursor.md`
- `Especificacao-Tecnica-Nexo.md`
- `design_handoff_nexo/` (protótipos)
