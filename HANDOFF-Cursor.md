# Nexo — Pacote de Handoff para Desenvolvimento

## O que este pacote contém

1. **`Nexo.dc.html`** — protótipo funcional completo do desktop (todo o núcleo operacional homologado: Equipamentos, Ordens de Serviço, Laudos, Portal do Solicitante, Contratos, Estoque, Pessoas, Auditorias/NC, Módulo Estratégico, Indicadores). Abra direto no navegador — é a referência visual e de interação pixel-a-pixel. Todo dado exibido é fictício/mock (ver seção "Dados fictícios" abaixo).
2. **`Nexo Mobile.dc.html`** — protótipo do app de campo (PWA): execução de OS, Ficha do Equipamento via QR, Abrir Solicitação, Lista de OS atribuídas, indicador offline/sincronização.
3. **`Especificacao-Tecnica-Nexo.md`** — especificação técnica módulo a módulo: dados/entidades, regras de negócio, API sugerida (estilo OpenAPI), critérios de aceite em Dado/Quando/Então. **Este é o documento-fonte para implementação** — o `.dc.html` mostra o "como fica", a especificação define o "como funciona".

## Como usar isso no Cursor / Claude Code

1. Trate a Especificação Técnica como a fonte de verdade das regras de negócio e modelo de dados — implemente a API e o banco a partir dela, seção por seção, na ordem em que aparece (Shell → Dashboard → Equipamentos → OS → Laudos → Contratos → Estoque → Pessoas → Estratégico → Auditorias → Financeiro/CAPEX/Relatórios/Configurações).
2. Use o `.dc.html` como referência de UI: reproduza layout, hierarquia visual, estados (vazio/carregando/erro), cores e microcopy exatamente como estão — não é preciso redesenhar, é para implementar em produção com os componentes reais do seu stack.
3. Onde a especificação e o protótipo divergirem, a especificação vence (foi revisada e homologada por último).

## Stack sugerida (não prescritiva)

Qualquer stack moderna serve; a especificação foi escrita agnóstica de framework. Sugestões práticas:
- **Frontend:** React/Next.js ou Vue — os componentes reutilizáveis descritos (`FloatingWindow`, `SideRail`, `TopBar`, `Dock`, `ConfirmModal`) mapeiam bem para componentes de UI padrão.
- **Backend:** Node/NestJS, ou qualquer stack REST — os endpoints sugeridos na especificação são só um contrato de referência, adapte livremente.
- **Banco:** relacional (Postgres) — o modelo tem muitas FKs (Equipamento → Fabricante/Modelo/Plano de Descrições/Setor, OS → Equipamento/Colaborador, Laudo → Procedimento, etc.) e beneficia de integridade referencial.

## Dados fictícios

Todo o conteúdo do protótipo (equipamentos, OS, laudos, colaboradores, contratos) é fictício, criado para demonstração — nomes, números de série, valores e datas não representam dados reais de nenhum hospital. Substituir por dados de produção/migração é responsabilidade da implementação.

## Ordem de implementação recomendada (MVP → completo)

**Fase 1 — Núcleo operacional (maior prioridade, uso diário):**
Shell/Auth → Equipamentos (+ Plano de Descrições/Fabricantes/Modelos) → Ordens de Serviço → Portal do Solicitante/Triagem.

**Fase 2 — Conformidade técnica:**
Procedimentos de Laudo (base reutilizável) → Laudo de Recebimento → Preventiva → Calibração → TSE → Certificados.

**Fase 3 — Gestão de suporte:**
Contratos → Estoque → Pessoas/Equipes/Instrumentos e Padrões.

**Fase 4 — Estratégico e mobile:**
Dashboard Executivo/Maturidade/Evolução → Auditorias/Não Conformidades → Indicadores/Construtor → App Mobile (PWA) com sincronização offline real.

**Fase 5 — Complementar:**
Financeiro (agregação) → CAPEX/Plano Diretor/Substituição Tecnológica → Relatórios Executivos → Configurações/Administração de Usuários.

## Fora de escopo desta fase

Ver seção 14 da Especificação Técnica — inclui regras fiscais completas de estoque/financeiro, workflow multi-etapa de aprovação de auditorias, drag-and-drop no Kanban, sincronização offline real (hoje simulada), assinatura digital com validade jurídica (ICP-Brasil), e isolamento real de dados multi-tenant.
