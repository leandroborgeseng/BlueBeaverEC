# Dados canônicos de import

Use sempre os arquivos em `apps/api/scripts/dados/`:

| Arquivo | Uso |
|---------|-----|
| `planos_manutencao_referencia.json` | Catálogo de tipos/planos |
| `equipamento_plano_mapping.json` | Mapping equipamento → plano |
| `aion_extract_v2.json` | Extract de equipamentos/planos |
| `equipamentos-reais.json` | Import patrimonial |
| `checklists-*` / `pops-biblioteca` | POPs e checklists |

Cópias na raiz do monorepo são ignoradas pelo git e não devem ser usadas.
