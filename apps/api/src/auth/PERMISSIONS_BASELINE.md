# Baseline de Permissões da API

Este teste de caracterização documenta o comportamento atual do controle de permissões da API, mapeando todas as rotas protegidas e seus requisitos de acesso por perfil.

## Estrutura

- **`permissions-baseline.test.ts`**: Teste que varre todos os controllers e extrai metadados de rotas
- **`permissions-baseline.snapshot.json`**: Matriz de permissões versionada (baseline)

## Cobertura

O teste verifica:

1. **Todas as rotas da API** são mapeadas automaticamente a partir dos metadados do NestJS
2. **Todos os perfis padrão** são testados:
   - ADMIN
   - GESTOR
   - ENGENHEIRO
   - TECNICO
   - TECNICO_RESTRITO
   - SOLICITANTE
   - AUDITORIA
3. **Comportamentos específicos**:
   - Rotas públicas (`@Public()`)
   - Rotas que só exigem JWT (sem `@RequirePermission`)
   - Rotas administrativas (config, pessoas) negam TECNICO e SOLICITANTE
   - TECNICO tem acesso a OS (EDICAO)
   - ADMIN tem acesso total

## Executar o teste

```bash
cd apps/api
pnpm test src/auth/permissions-baseline.test.ts
```

Ou na raiz:

```bash
pnpm test
```

## Regenerar o snapshot

**ATENÇÃO**: Só regenere o snapshot após **revisar e validar** que as mudanças de permissão são intencionais.

```bash
cd apps/api
UPDATE_BASELINE=1 npx tsx src/auth/permissions-baseline.test.ts
```

O snapshot atualizado será gravado em `permissions-baseline.snapshot.json`.

## Como usar este baseline

### Detectar mudanças não intencionais

Qualquer alteração em:
- `PERMISSOES_PADRAO` (packages/shared/src/index.ts)
- Decorators `@RequirePermission` nos controllers
- Adição/remoção de rotas

Será detectada pelo teste, que falhará mostrando:
- Qual rota mudou
- Qual perfil foi afetado
- O resultado esperado vs. atual

### Validar mudanças intencionais

1. Faça a mudança desejada (ex: alterar permissão em PERMISSOES_PADRAO)
2. Rode o teste para ver o diff
3. Se estiver correto, regenere o snapshot com `UPDATE_BASELINE=1`
4. Commit o snapshot atualizado junto com a mudança de código

## Exemplo de falha detectada

Se alterar `PERMISSOES_PADRAO.TECNICO.auditorias` de `NENHUM` para `LEITURA`:

```
Rota /auditorias [TECNICO]: resultado mudou de NEGADO para PERMITIDO
+ actual - expected

+ 'PERMITIDO'
- 'NEGADO'
```

Isso impede que mudanças acidentais em permissões passem despercebidas.

## Limitações

- Não testa perfis customizados (PerfilCustom) — apenas os perfis padrão
- Não exercita o banco de dados
- Foca no comportamento do `PermissionsGuard` em nível de módulo, não em regras de negócio específicas (ex: "técnico só edita OS atribuída a ele")
