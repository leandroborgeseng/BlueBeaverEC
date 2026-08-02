# Handoff: Nexo — Sistema de Gestão de Engenharia Clínica

## Overview
Nexo é um sistema de gestão de Engenharia Clínica hospitalar: cadastro e ciclo de vida de equipamentos médicos, Ordens de Serviço, laudos técnicos (Recebimento, Preventiva, Calibração, Segurança Elétrica/TSE), contratos, estoque, pessoas, auditorias/não conformidades e um módulo estratégico (maturidade, conformidade, indicadores). Inclui também um app de campo (PWA) para técnicos em mobilidade.

## About the Design Files
Os arquivos `.dc.html` deste pacote são **referências de design construídas em HTML** — protótipos funcionais mostrando aparência e comportamento pretendidos, não código de produção para copiar diretamente. A tarefa é **recriar estes designs no ambiente real do projeto** (React, Vue, ou o framework mais adequado, caso ainda não exista um) usando os padrões e bibliotecas já estabelecidos na base de código — ou escolher o framework mais apropriado se o projeto for greenfield.

## Fidelity
**Alta fidelidade (hifi).** Os protótipos foram homologados tela a tela (ver seção "Homologação" da Especificação Técnica) com cores, tipografia, espaçamento e interações definitivos. O desenvolvedor deve recriar a UI com fidelidade próxima ao pixel, usando os componentes/bibliotecas já existentes na base de código de destino.

## Screens / Views
O inventário completo de telas, com objetivo, dados, ações, regras de negócio, componentes visuais e critérios de aceite por tela, está em **`Especificacao-Tecnica-Nexo.md`** — organizado por módulo (Shell, Dashboard, Equipamentos, Ordens de Serviço, Laudos Técnicos, Contratos, Estoque, Pessoas, Módulo Estratégico, Auditorias, Financeiro/CAPEX/Relatórios/Configurações, App Mobile). Esse documento é a fonte primária — não duplicado aqui para evitar divergência.

Resumo de telas por arquivo:
- **`Nexo.dc.html`**: todas as telas desktop — sidebar colapsável com flyouts por módulo, `TopBar` com busca global/notificações/perfil, e um sistema de janelas flutuantes (`FloatingWindow`) arrastáveis/redimensionáveis reutilizado por todo cadastro/detalhe (Equipamento, OS, Laudos, Contratos, etc.), com dock de janelas minimizadas.
- **`Nexo Mobile.dc.html`**: app de campo — execução de OS (checklist, itens, fotos, assinatura digital), Ficha do Equipamento via QR, Abrir Solicitação de Serviço, Lista de OS atribuídas, indicador de offline/sincronização.

## Interactions & Behavior
Detalhado por tela na Especificação Técnica, seção "Regras de negócio" e "Critérios de aceite" (formato Dado/Quando/Então) de cada módulo. Padrões recorrentes:
- Toda ação destrutiva (arquivar, excluir, fechar OS, fechar Não Conformidade) passa por confirmação com justificativa quando aplicável.
- Estados vazio/carregando/erro padronizados em todas as listagens principais.
- Combos vinculados (Fabricante→Modelo, Setor, etc.) com busca/filtro, nunca texto livre para dados de outro cadastro.
- Campos calculados (MTTF/MTBF, depreciação, erro% em calibração) nunca editáveis diretamente — sempre derivados.

## State Management
Ver "Dados" e "Regras de negócio" de cada tela na Especificação Técnica — cada entidade (Equipamento, OS, Laudo, Contrato, etc.) tem campos obrigatórios/calculados/históricos claramente distinguidos, e a API sugerida (estilo OpenAPI, por módulo) descreve as transições de estado esperadas no backend.

## Design Tokens
O protótipo usa estilos inline (sem stylesheet à parte) com paleta em OKLCH. Tokens principais observáveis no código-fonte dos `.dc.html`:
- **Cor de destaque/ação primária:** `oklch(0.64 0.19 38)` (laranja/terracota).
- **Cor de menu/marca:** azul do logotipo Nexo (ver sidebar).
- **Neutros de texto:** `oklch(0.2–0.5 0.02 250)` (escala de cinza-azulado).
- **Estados de sucesso/erro/alerta:** verde `oklch(0.4 0.13 150)`, vermelho `oklch(0.45 0.15 25)`, amarelo `oklch(0.45 0.13 85)`.
- **Tipografia:** hierarquia por peso (600–800) e tamanho (11px labels → 21px títulos de tela), sem uso de fontes decorativas.
- **Raio de borda:** 6-10px em cards/inputs/botões.

Extraia os valores exatos direto do `style=` inline de cada elemento nos `.dc.html` — são a fonte de verdade, não redigitados aqui para evitar divergência.

## Assets
Nenhum asset de imagem externo — ícones são SVG inline no próprio HTML. Logotipo Nexo (parte "castor verde" minimizado, ver sidebar) é desenhado em SVG dentro do arquivo.

## Files
- `Nexo.dc.html` — protótipo desktop completo.
- `Nexo Mobile.dc.html` — protótipo do app de campo (PWA).
- `Especificacao-Tecnica-Nexo.md` — especificação técnica módulo a módulo (dados, regras de negócio, API sugerida, critérios de aceite). **Leia este arquivo primeiro** — é o documento-fonte para implementação; os `.dc.html` mostram "como fica", a especificação define "como funciona". Onde divergirem, a especificação vence.
