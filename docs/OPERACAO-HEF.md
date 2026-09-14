# Operação HEF — Aion Engenharia Clínica

Ambiente de produção: `https://hef.aion.eng.br`  
Repositório: `https://github.com/leandroborgeseng/BlueBeaverEC`  
Hospedagem: Railway (serviços Web `@nexo/web` e API `@nexo/api`) + Postgres.

Este documento descreve o que está no ar, como operar, como recuperar e o que **não** está pronto. Não declara o hospital pronto para uso pleno se houver bloqueador.

## 1. O que está no main / hef (set 2026)

Fatura Railway **paga** em 14/09/2026. Main inclui `06da417` (laudo final/PDF), `3bb0e57`+`a6ff91e` (nest build) e `526428c` (`next build`: tipos do shell/laudo). **Web no ar** (`526428c`): `/login`, `/qualidade/*`, `/fornecedores`, `/atendimentos-externos` = 200. **API:** Railway marcou `@nexo/api` Success em `1a8004c`, mas o `/api/health` público ainda responde **502** Cloudflare — login e indicadores não andam até o proxy Web (`API_INTERNAL_URL`) alcançar a API. Health esperado: `{ status: "ok", service: "aion-api", version: "<sha7>" }`.

| Módulo | Código no main | Produção HEF | Situação |
|--------|----------------|--------------|----------|
| Auth, perfis, personificação | sim | Web sim; API só com health 200 | Pronto quando a API subir |
| Inventário HEF (ciclo de vida, TAG HEF-NNNN, etiqueta autenticada) | sim | **405** equipamentos (último teste com API no ar) | Pronto |
| OS núcleo (abrir, assumir, transferir, atender, aguardar, concluir, SLA, triagem) | sim | sim | Pronto, com ressalvas |
| Portal do solicitante | sim | sim | Pronto |
| App de campo / PWA | sim | sim | Pronto |
| Planejamento preventiva/calibração/TSE/qualificação (Prompt 2) | sim | **sem ramp-up em massa**; portal lê a agenda do plano **só do setor** | Parcial — 1 plano de teste só com API healthy |
| Checklist / relatório de serviço (Prompt 3) | sim (`d01f9e7` + `06da417`) | rascunho → finalizar → PDF no código; hef ainda sem documento emitido | Parcial — anexo-por-item **não** feito (não é rápido) |
| Envio ao fornecedor e retorno (Prompt 4) | sim (`1f63fa4`) | telas no ar com cadastro vazio | Parcial — jornada não exercitada |
| Consumo de material, saldo e custo (Prompt 5) | sim (`043a31e` + `e9a44f8`) | telas no ar; 2 itens demo de seed | Parcial — estoque real não carregado |
| Indicadores (Prompt 6) | sim (`6bf1562`) | cumprimento **0/0 = dados insuficientes**, nunca 100% | Validar no hef após o deploy |
| Documentação / qualidade (Prompt 7) | sim (`eed6cb9` + `526428c`) | `/qualidade` e subrotas **200** no hef | Telas no ar; cadastro vazio até haver documento |

Estabelecimento no banco: id `estab_modelo` (legado do seed). CNPJ e fuso já estão de HEF; o **nome** era regravado para “Hospital e Maternidade Modelo” a cada boot — corrigido neste pacote.

## 2. Configuração (variáveis)

Definir no Railway (API e Web). Nunca commitar valores reais.

### API

| Variável | Obrigatória | Notas |
|----------|-------------|--------|
| `DATABASE_URL` | sim | Postgres Railway. Senha pode ter `$` — o boot não expande variáveis. |
| `JWT_SECRET` | sim | Forte. Boot recusa vazio/`change-me`. |
| `NODE_ENV` | sim | `production` (esconde stack no cliente). |
| `PORT` / `API_PORT` | sim | Railway injeta `PORT`. |
| `CORS_ORIGIN` / `WEB_ORIGIN` | sim | `https://hef.aion.eng.br` |
| `PLANOS_CRON` | não | `0` desliga o cron das preventivas. |
| `RELATORIOS_CRON` | não | `0` desliga o cron horário de relatórios. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | não | Sem SMTP, disparo de relatório fica stub (não finge envio). |
| `SEED_ON_BOOT` | **não ligar** | Força seed demo completo. |
| `RESET_INVENTARIO_OPERACIONAL` | **nunca ligar** | Wipe de OS/laudos + reimport. Apaga operação. |
| `IMPORT_EQUIPAMENTOS_ON_BOOT` | não | Reimporta JSON oficial **sem** wipe; só completa tags faltantes. |
| `RESET_INVENTARIO_ALLOW_LOCAL` | não | Só lab local. |

### Web

| Variável | Obrigatória | Notas |
|----------|-------------|--------|
| `API_INTERNAL_URL` | sim | Se o TCP privado cair: `https://<api>.up.railway.app` (Generate Domain na API). Privado só se o mesh responder: `http://${{@nexo/api.RAILWAY_PRIVATE_DOMAIN}}:${{@nexo/api.PORT}}`. Sem `/api` no fim. |
| `API_PUBLIC_URL` | se privado morto | Mesma URL HTTPS pública da API. O proxy usa HTTPS público **antes** de `*.railway.internal`. |
| `NEXT_PUBLIC_API_URL` | não | Vazio = same-origin `/api` (recomendado). |

Logins demo (não são engenheiros reais): `engenheiro@aion.local`, `tecnico@aion.local`, `campo@aion.local`, `solicitante@aion.local` / `aion1234`.  
Contas reais no ar: `leandro.borges@aion.eng.br` (ADMIN), `bsnaldi@hrtc.faepa.br`, `rmjuvencio@hrtc.faepa.br`, `bcrodarte@hrtc.faepa.br`. **Não migrar, não redefinir senha, não recriar colaborador.**

## 3. Migrações

No start da API (`apps/api/scripts/start-prod.mjs`) roda `prisma migrate deploy`. Não usar `migrate reset` nem `db push` em produção.

Migrações **já esperadas no hef** (main publicado):

- `20260802120000_init` … `20260803080000_indicador_snapshot_tenant`
- `20260908120000_tecnico_restrito`
- `20260911140000_os_setor_equipamento_opcional`
- `20260912010000_os_nucleo_operacional`
- `20260913120000_plano_descricao_sla`
- `20260914010000_inventario_ciclo_vida`
- `20260914020000_propriedade_outro`
- `20260914150000_planejamento_preventivas` (Prompt 2)
- `20260914160000_checklists_documentacao` (Prompt 3) — no GitHub main; só no hef após o deploy
- `20260914170000_fornecedores_contratos_atendimento` (Prompt 4)
- `20260914180000_estoque_pecas_custos` (Prompt 5)
- `20260914190000_docs_treinamentos_ocorrencias` (Prompt 7)

Reversão de migration: **não há script de down**. Reverter = deploy do commit anterior + restauração de backup se o schema já tiver sido aplicado.

## 4. Crons

| Job | Expressão | Fuso | Efeito | Desligar |
|-----|-----------|------|--------|----------|
| Gerar OS de planos vencidos | `20 6 * * *` | `America/Sao_Paulo` (06:20 BRT) | Cria/vincula OS de preventiva etc. **sem duplicar** se já houver OS aberta do plano | `PLANOS_CRON=0` |
| Relatórios agendados | `0 * * * *` | `America/Sao_Paulo` | Gera PDF e tenta SMTP | `RELATORIOS_CRON=0` |

Railway é UTC; sem `timeZone` o cron de planos rodaria 03:20 BRT. A correção de fuso está neste pacote.

Agenda de preventiva no hef está **vazia**. Não disparar `POST /api/planos/ramp-up` em massa sem o gestor: gera dezenas/centenas de ocorrências e, no dia seguinte, OS.

## 5. Backup e restauração

**Pendência.** Não há backup testado neste repositório nem roteiro de restore ensaiado.

O que existe hoje:

- Postgres no Railway — backups automáticos **somente se** o plano/serviço tiver a opção ligada (verificar no painel).
- Inventário oficial versionado em `apps/api/scripts/dados/equipamentos-reais.json` (reimport **não** reconstrói OS, laudos, usuários nem movimentações).
- Marcador `CargaInventario` / `inventario_oficial_hef_v2` impede wipe no boot normal.

Restaurar de verdade (quando o backup Railway existir):

1. Pausar API (evitar writes).
2. Restore do snapshot Postgres no painel Railway.
3. Subir a API (migrate deploy é idempotente).
4. **Não** ligar `RESET_INVENTARIO_OPERACIONAL`.
5. Conferir contagem de equipamentos (~405), usuários reais e OS abertas.

Até isso ser ensaiado, **não há recuperação garantida**.

## 6. Deploy e reversão (GitHub → Railway)

### Deploy

1. Merge/push em `main` (sem force push).
2. Railway reconstrói Web (`apps/web/Dockerfile`) e API (`apps/api/Dockerfile`).
3. API: `migrate deploy` → `maybe-seed` (não reseed se já há usuários) → `ensure-demo-users` → `ensure-admin-user` → `ensure-colaboradores-operacionais` → sobe HTTP → import de equipamentos **em background** (completa tags, sem wipe se o marcador existe).
4. Health: API `GET /api/health` → `{ status: "ok", service: "aion-api", version: "<sha7>" }`; Web `/`.
5. Conferir `https://hef.aion.eng.br/login`.

`railway.toml` da API ainda declara `releaseCommand` de import. O start já importa; o marcador evita wipe. Não usar `RESET_INVENTARIO_OPERACIONAL`.

### Reversão

1. No Railway, redeploy do **commit anterior** (Deployments → commit bom).
2. Se a migration nova já rodou e o commit antigo não entende o schema, **não** volte só o código: restaure o Postgres ou avance um hotfix.
3. Sem force push em `main`.
4. Não rode `migrate reset`, seed forçado nem wipe.

### O que o boot **não** pode fazer

- Apagar inventário HEF.
- Recriar a carga HRTC antiga.
- Sobrescrever o nome da instituição (corrigido: `ensure-demo-users` não regrava `nome`).
- Redefinir setores de `solicitante@` se já houver vínculo.
- Criar técnico em massa / “migrar” engenheiros reais.

O boot **ainda** redefine senha das contas **demo** `@aion.local` e a senha do super admin de produção a cada start (scripts `ensure-demo-users` e `ensure-admin-user`). Trate isso como risco conhecido.

## 7. Roteiros curtos

### Técnico (campo / `tecnico@` / `campo@`)

1. Entrar → área de trabalho ou `/mobile`.
2. Assumir OS não atribuída, ou atender as “minhas”.
3. Iniciar → (opcional) aguardar com motivo → retomar → concluir com serviço, resultado e condição final do equipamento.
4. Transferir com versão (`expectedVersao`) se outro já assumiu — a API recusa concorrência.
5. Não acessa laudos, estoque, config, indicadores (403 no backend; o shell redireciona).

### Usuário final (solicitante)

1. Entrar → portal “Abrir OS”.
2. Só setores vinculados. Acompanhar em “Minhas solicitações”.
3. Não vê OS de outros (`403` “Você só acompanha as suas solicitações”).
4. Pedido de reabertura só em OS concluída da própria solicitação.

### Gestor / engenheiro

1. Cadastro de equipamento: TAG vazia gera `HEF-NNNN`; importação **não** sobrescreve.
2. Etiqueta: QR `aion:eq:<token>` — leitura exige login (não é URL pública).
3. Abrir OS interna ou triar chamado do portal (vincular equipamento).
4. Atribuir a colaborador operacional (nunca ao solicitante).
5. Cronograma: portal/campo leem a agenda do plano (Prompt 2) **só do setor**, não a validade de laudo. Não gerar ramp-up em massa. 1 plano de teste pontual é permitido para a agenda não ficar 0.
6. Personificar perfis demo para treinar; não alterar e-mail/senha dos engenheiros reais.
7. Config → Organização: nome, CNPJ, fuso `America/Sao_Paulo`.

## 8. Confiabilidade (o que foi checado)

- **Concorrência de atribuição:** `atribuicaoVersao` + `expectedVersao`.
- **Duplo envio de OS:** o servidor **não** impede duas OS no mesmo equipamento (só avisa). O front da OS rápida desabilita o botão. Não dê duplo clique na OS interna.
- **Anexos:** até 2 MB, imagem/PDF, escopo por OS + estabelecimento. Interno oculto ao solicitante. Etiqueta e ficha exigem JWT.
- **IDOR:** solicitante bloqueado em `/os`, `/equipamentos`, `/estoque`, `/indicadores`. Portal filtra pelas próprias solicitações. Enumeração 403 vs 404 em OS alheia permanece (não vaza corpo).
- **Erros:** validação devolve lista de campos, sem secret. 401 de login: “Credenciais inválidas”. 502 do proxy Next **não** devolve mais host interno.
- **Paginação:** equipamentos e OS paginam (20–100). Quadro de processos corta em 100 por coluna (`meta.truncated`). Estoque pagina. Portal minhas-OS `take: 80` — gargalo futuro.
- **Fuso:** organização `America/Sao_Paulo`; crons alinhados (após este deploy). Datas de preventiva usam dia civil, não horário de abertura da OS.

## 9. Pronto / parcial / não implementado

**Não está pronto para produção plena.** Bloqueadores e lacunas:

1. **Backup/restore não ensaiado** (bloqueador de recuperação). Continua pendente — não há como ensaiar restore daqui.
2. **Agenda de preventiva** — código no ar; **não** disparar `POST /api/planos/ramp-up`. 1 plano + 1 ocorrência de teste, num equipamento só, depois da API healthy.
3. **Prompts 3–7 no `main`**: laudo rascunho→final→PDF existe; anexo-por-item não. Contratos/estoque/qualidade sobem com cadastro vazio. Revalidar no hef após o deploy (o teste pós-pagamento viu API 502).
4. Cumprimento 0/0 **não** é mais 100% no código (`6bf1562`). Confirmar no painel depois do deploy.
5. Login “esqueci a senha” é só texto (não implementado).
6. OS com SLA estourado no dashboard (dado operacional, não regressão).

Uso real **restrito** (inventário + OS corretiva + portal + campo) é possível depois deste pacote de integração, com contas demo e engenheiros reais já cadastrados, **desde que** o gestor aceite a ausência de backup ensaiado e de preventiva calendário.

## 10. Testes feitos em hef (não destrutivos)

Ver relatório do Prompt 8: logins, IDOR, etiqueta, filas, cronograma vazio, estoque demo, indicadores, jornada de OS de teste, engenheiros reais intactos.
