# Nexo — Especificação Técnica para Desenvolvimento (Handoff Cursor)

Documento de especificação das telas homologadas do protótipo Nexo (Engenharia Clínica). Cobre desktop (`Nexo.dc.html`) e o app de campo mobile (`Nexo Mobile.dc.html`). Serve de entrada para implementação real (banco de dados, API, frontend produtivo).

Convenções: `Dado/Quando/Então` para critérios de aceite. Rotas sugeridas em `kebab-case`. Todos os valores monetários em BRL. Datas em `dd/mm/aaaa`.

---

## 1. Estrutura Geral da Aplicação (Shell)

**Rota:** `/` (shell persistente) · **Componentes reutilizáveis:** `SideRail` (menu lateral colapsável com flyouts), `TopBar` (busca global, seletor de organização/estabelecimento, notificações, favoritos/recentes, ajuda contextual, perfil), `FloatingWindow` (janela flutuante arrastável/redimensionável reutilizada por todo cadastro/detalhe), `Dock` (barra inferior de janelas minimizadas), `ConfirmModal` (genérico).

**Regras de negócio:**
- Cada tipo de registro (Equipamento, OS, Laudo, Contrato, Fabricante, Modelo, Fornecedor, Colaborador, Procedimento) abre em `FloatingWindow` com tamanho fixo por `kind` (não redimensiona ao trocar de aba).
- Múltiplas janelas podem ficar abertas simultaneamente; minimizar envia para o `Dock`; fechar sem salvar não persiste alterações.
- Perfil ativo (`Engenheiro` | `Técnico` | `Auditoria`) determina permissões de edição em cascata (ver regras por tela abaixo).

**API sugerida:**
```
GET  /api/session/me                → perfil, permissões, organização/estabelecimento atual
GET  /api/nav/favoritos
GET  /api/nav/recentes
GET  /api/notificacoes?unread=true
```

---

## 2. Dashboard (Gestor de Engenharia Clínica)

**Rota:** `/dashboard` · **Objetivo:** visão operacional diária para o engenheiro/gestor decidir prioridades do dia.

**Dados:** KPIs (equipamentos ativos, OS abertas, MTTR médio, disponibilidade), OS por situação (gráfico de barras), situação dos equipamentos (donut), OS recentes (lista), contratos a vencer.

**Regras de negócio:** KPIs recalculados em tempo real a partir de OS/Equipamentos; "Contratos a vencer" considera janela de 30 dias.

**API:**
```
GET /api/dashboard/kpis
GET /api/dashboard/os-por-situacao
GET /api/dashboard/equipamentos-status
GET /api/dashboard/os-recentes?limit=5
GET /api/dashboard/contratos-vencendo?dias=30
```

**Critérios de aceite:**
- Dado que existem OS com situação "Concluída", "Em Andamento" e "Aberta", quando o dashboard carrega, então o gráfico de barras reflete a contagem exata de cada situação.
- Dado um contrato com vigência final em ≤30 dias, quando o dashboard carrega, então ele aparece em "Contratos a vencer".

---

## 3. Equipamentos

### 3.1 Lista de Equipamentos — `/equipamentos`
**Componentes:** tabela paginada, filtros (setor, fabricante, modelo, situação), busca por texto, estados carregando/sem-resultado/sucesso, ações em lote (excluir/alterar — restrito a Engenheiro), edição inline de TAG com histórico obrigatório.

**Regras de negócio:**
- Alteração de TAG exige justificativa e é registrada em histórico auditável (não pode ser apagado).
- Exclusão/alteração em lote: somente perfil Engenheiro.

**API:**
```
GET    /api/equipamentos?setor=&fabricante=&modelo=&situacao=&q=&page=
PATCH  /api/equipamentos/:tag/tag        body:{novaTag, justificativa}
POST   /api/equipamentos/batch-delete    body:{tags:[]}
POST   /api/equipamentos/import          multipart (planilha padrão)
GET    /api/equipamentos/import/template
```

**Critérios de aceite:**
- Dado um usuário perfil Técnico, quando tenta excluir em lote, então a ação fica bloqueada/oculta.
- Dado um equipamento com TAG alterada, quando se abre o histórico, então todas as alterações anteriores aparecem com data, usuário e justificativa.

### 3.2 Cadastro / Ficha do Equipamento — `/equipamentos/:tag`
**Abas:** Geral, Observação, Checklist de Recebimento, Manutenção, Componentes, Anexos, Certificados de Calibração, Software.

**Regras de negócio:**
- Campos Fabricante, Modelo, Setor, Fornecedor, Centro de Custo são dropdowns com busca vinculados a outros cadastros (não texto livre); "criar novo" inline sem perder contexto.
- Valor de Aquisição/Substituição visível apenas para perfil Engenheiro (confidencial).
- Equipamento "Arquivado"/"Inativo" bloqueia edição mas mantém histórico visível; reabertura gera log de auditoria.
- Todos os perfis podem fechar a janela; apenas Engenheiro salva alterações (demais em modo leitura).
- Checklist de Recebimento ausente **não bloqueia** o cadastro/ativação do equipamento, mas gera um **alarme visual persistente** (badge/alerta na ficha e na lista) enquanto pendente — item de acompanhamento obrigatório do gestor, não impeditivo de uso.

**Dados (entidade `Equipamento`):** tag*, nome*, descricaoId* (FK Plano de Descrições — "tipo do ativo"), fabricanteId*, modeloId*, setorId*, fornecedorId, centroCustoId, patrimonio, nSerie, dataAquisicao, valorAquisicao (confidencial), valorSubstituicao (confidencial), situacao (enum: ATIVO|EM_GARANTIA|EM_GARANTIA_ESTENDIDA|INATIVO|ARQUIVADO).

**Herança do Plano de Descrições (tipo do ativo):** `criticidade` (Baixa/Média/Alta) e `vidaUtilAnos` (para cálculo de depreciação) NÃO são campos do Equipamento — são definidos uma vez no cadastro do Plano de Descrições e herdados por todo equipamento daquele tipo. Isso garante consistência (ex: todo "Ventilador Pulmonar" é Alta criticidade, sem depender de julgamento individual por cadastro). Editar a criticidade/vida útil no Plano de Descrições reflete em todos os equipamentos daquele tipo retroativamente (recalcula depreciação e indicadores).

**Regra de exclusão:** Equipamento nunca é excluído fisicamente — apenas Arquivado (soft delete), preservando OS/Laudos/Certificados vinculados para fins de auditoria e histórico. Exclusão definitiva não existe nesta fase (fora de escopo, ver seção 14).

**Fabricante × Modelo:** Modelo pertence a exatamente 1 Fabricante. A combinação (Fabricante, Modelo) é única — não pode haver duas linhas de cadastro com o mesmo par; o mesmo nome de Modelo pode existir sob Fabricantes diferentes (ex: "X200" da Fabricante A e "X200" da Fabricante B são registros distintos).

**API:**
```
GET   /api/equipamentos/:tag
PATCH /api/equipamentos/:tag
POST  /api/equipamentos/:tag/arquivar
POST  /api/equipamentos/:tag/reativar
GET   /api/fabricantes?q=       (para combo com busca)
GET   /api/modelos?fabricanteId=&q=
```

**Critérios de aceite:**
- Dado um equipamento Arquivado, quando um perfil Técnico abre a ficha, então todos os campos aparecem somente-leitura.
- Dado que o usuário reabre um equipamento arquivado, então um evento de auditoria é criado com usuário e timestamp.

### 3.3 Checklist de Recebimento (dentro do Equipamento) / Laudo de Recebimento
Ver seção 6 (Laudos) — usa o mesmo padrão de Procedimento de Laudo.

### 3.4 Ficha Vida do Equipamento — `/equipamentos/:tag/ficha-vida`
**Componentes:** filtros (setor, tipo, fabricante, modelo) + campo de busca textual + botão Buscar; lista de resultados (mesmo padrão da Lista de Equipamentos, clicável); cards de MTTF/MTBF em gráfico de barras; valor depreciado; somatório de custos (peças + serviços de OS + rateio de contrato).

**Regras de negócio:**
- MTTF/MTBF calculados a partir do histórico de OS do equipamento (intervalos entre falhas / tempo em operação).
- Depreciação: linear, usando `vidaUtilAnos` herdado do Plano de Descrições (tipo do ativo) do equipamento, a partir de `valorAquisicao` e `dataAquisicao`. Valor depreciado = `valorAquisicao − (valorAquisicao / vidaUtilAnos × anosDecorridos)`, nunca abaixo de zero.
- Custo total = soma de itens tipo "Material"/"Mão de obra" das OS do equipamento + valor rateado de contratos vinculados.

**API:**
```
GET /api/equipamentos/:tag/ficha-vida
GET /api/equipamentos/:tag/confiabilidade   → {mtbf, mttf, historicoMensal}
GET /api/equipamentos/:tag/custos            → {totalOS, totalContrato, nOS, nContratos}
```

**Critérios de aceite:**
- Dado um equipamento sem OS registradas, quando se abre a Ficha Vida, então MTTF/MTBF aparecem como "sem dados" (não erro).
- Dado filtros aplicados (setor + fabricante), quando clico em Buscar, então a lista mostra apenas equipamentos que atendem a TODOS os filtros simultaneamente.

---

## 4. Ordens de Serviço

### 4.1 Lista de Ordens de Serviço — `/os`
**Componentes:** painel de filtros completo (Área Técnica, Oficina, Setor, Centro de Custo, Contrato, Descrição, Modelo, Fabricante, Plano, Procedimento, TAG/Patrimônio/Nº Série, Estado, Nº OS, Observação, datas Abertura/Fechamento/Funcionamento/Parada, checkboxes de Situação), tabela de resultados colorida por prioridade, toolbar de ações em lote, legenda de prioridade.

**Dados (entidade `OrdemServico`):** numero* (autogerado), codigo, equipamentoTag* (FK), setorCliente, tipo (enum: Corretiva|Preventiva|Calibração|TSE), tipoCodigo, oficina, prioridade (enum: Baixa|Média|Alta|Urgente), status (enum: Não Atribuída|Aberta|Em Andamento|Concluída|Cancelada), abertura*, fechamento, responsavelId, pendencia, observacaoRequisicao, contratoId.

**SLA por prioridade (horas para atendimento/solução):** Urgente = 2h · Alta = 8h · Média = 24h · Baixa = 72h. Contado a partir de `abertura`; OS que ultrapassa o SLA sem `fechamento` fica marcada como "Atrasada" (alerta visual na lista e no dashboard) — não bloqueia nenhuma ação.

**Regras de negócio:**
- Fechar/Cancelar/Reabrir OS: restrito a perfil Engenheiro. Demais perfis veem aviso "Somente o Engenheiro pode alterar o status desta OS".
- Fechamento bloqueado se houver `pendencia` preenchida (mensagem explícita na UI).
- **Reabertura**: sem limite de quantidade — pode ser reaberta quantas vezes forem necessárias, mas cada reabertura exige justificativa obrigatória (idêntica em rigor à de fechamento/recusa).
- **Cancelamento**: exige justificativa obrigatória (mesmo padrão de recusa de Solicitação — texto livre, visível no histórico da OS).
- **Atribuição**: OS aberta sem `responsavelId` entra automaticamente em status **"Não Atribuída"**, visível numa fila própria (ordenada por prioridade e data de abertura) até um Engenheiro atribuir um responsável — só então avança para "Aberta"/"Em Andamento".
- **Duplicidade**: ao abrir uma nova OS para um equipamento que já tem outra OS ativa (Não Atribuída/Aberta/Em Andamento), o sistema exibe um alerta não-bloqueante ("Já existe OS #X em aberto para este equipamento") — permite prosseguir, pois podem ser motivos diferentes.
- Toda mudança de status gera entrada em log de auditoria (usuário, ação, timestamp, justificativa quando aplicável).

**API:**
```
GET   /api/os?areaTecnica=&oficina=&setor=&situacao[]=&numero=&dataAberturaDe=&dataAberturaAte=...
GET   /api/os/nao-atribuidas                              (fila de atribuição, ordenada por prioridade)
PATCH /api/os/:numero/atribuir       body:{responsavelId}
PATCH /api/os/:numero/status         body:{acao: fechar|cancelar|reabrir, justificativa}  → 409 se pendencia aberta; justificativa obrigatória para cancelar/reabrir
GET   /api/os/:numero/log
GET   /api/os/equipamento/:tag/ativas   (para checagem de duplicidade ao abrir nova OS)
```

**Critérios de aceite:**
- Dado uma OS com pendência não resolvida, quando o Engenheiro tenta Fechar, então o sistema bloqueia e exibe a mensagem de pendência.
- Dado um perfil Técnico, quando abre uma OS aberta, então os botões Fechar/Cancelar/Reabrir não aparecem, apenas o aviso de permissão.
- Dado que uma OS ultrapassa o SLA da sua prioridade sem fechamento, então ela aparece marcada como "Atrasada" na lista e no dashboard.
- Dado que o Engenheiro tenta reabrir uma OS Concluída sem preencher justificativa, então o sistema bloqueia a ação até o campo ser preenchido.
- Dado que já existe uma OS ativa para o equipamento EQ-0001, quando outro usuário tenta abrir uma nova OS para o mesmo equipamento, então um alerta é exibido mas a criação prossegue normalmente se confirmada.

### 4.2 Abrir Ordem de Serviço (completa) — modal/janela
**Campos:** Equipamento/Setor (radio + combo com busca), datas (abertura, parada), Patrimônio/Nº Série/Complexidade (auto-preenchidos pelo equipamento), Oficina, Tipo de Manutenção, Prioridade, Contrato, Pendência, Responsável, Peça/Quantidade (linkado ao Estoque com reserva), Ocorrência, Plano de Manutenção, Reclamante/Nº Chamado, Observações, histórico das 5 últimas OS do mesmo equipamento.

**Regras de negócio:**
- Selecionar uma peça no item "Material" reserva a quantidade no Estoque (bloqueia disponibilidade para outras OS) até a OS ser fechada/cancelada.
- Prioridade "Urgente" com equipamento crítico deve alertar visualmente.

**API:**
```
POST /api/os                     body: OrdemServico + itens[]
GET  /api/estoque/itens?q=        (para combo de peça)
POST /api/estoque/reservas        body:{itemCodigo, qtd, osNumero}
```

### 4.3 Ordem de Serviço Rápida
Formulário reduzido para abertura+execução em um passo (Mão de Obra, Serviço Executado/Externo, deslocamento, peça) com ação de "Fechar OS" ou "Deixar OS Aberta".

### 4.4 Triagem de Solicitações — `/os/triagem-solicitacoes`
**Objetivo:** converter Solicitação de Serviço (aberta por qualquer colaborador) em OS, ou recusar com justificativa.

**Dados (entidade `SolicitacaoServico`):** protocolo* (autogerado, `SOL-####`), equipamentoTag, setor, descricao*, urgencia (enum: Baixa|Média|Alta|Parada de Equipamento Crítico), solicitanteNome*, ramal, dataHora*, status (enum: Pendente|Convertida em OS|Recusada: <motivo>).

**Regras de negócio:**
- Aprovar → abre janela "Abrir OS" pré-preenchida (equipamento, setor, ocorrência = descrição, reclamante = solicitante); prioridade sugerida a partir da urgência (Crítica→Urgente, Alta→Alta, demais→Média).
- Recusar exige justificativa obrigatória, visível ao solicitante.
- Urgência percebida (solicitante) é campo distinto da Prioridade técnica (definida pelo engenheiro na OS).

**API:**
```
GET   /api/solicitacoes?status=
POST  /api/solicitacoes                    (Portal do Solicitante)
POST  /api/solicitacoes/:id/aprovar         → cria OS vinculada
POST  /api/solicitacoes/:id/recusar         body:{justificativa}
```

**Critérios de aceite:**
- Dado que uma solicitação é recusada, quando o solicitante consulta o status, então a justificativa aparece integralmente.
- Dado que uma solicitação é aprovada, então a OS criada referencia o protocolo de origem (rastreabilidade).

### 4.5 Certificados de Calibração — `/os/certificados-calibracao`
Lista unificada de certificados (Calibração + TSE) com status automático (Válido/A Vencer ≤60 dias/Vencido), filtro por setor/hospital, ação Consultar (abre documento formatado) e Reabrir.

**API:**
```
GET  /api/certificados?tipo=&status=&setor=
GET  /api/certificados/:numero/documento
POST /api/certificados/:numero/reabrir
```

### 4.6 Auditoria de Ordens de Serviço — `/os/auditoria`
Trilha de auditoria (Abertura/Fechamento/Cancelamento/Reabertura/Alteração de Prioridade) com filtro por tipo de ação. Somente leitura, imutável.

### 4.7 Histórico do Equipamento — `/os/historico-equipamento`
Linha do tempo unificada (OS + Laudos/Certificados) por equipamento, ordenada por data decrescente.

### 4.8 Quadro de Processos — `/os/quadro-processos`
Kanban de OS por status (Aberta/Em Andamento/Concluída/Cancelada), drag opcional (fora de escopo nesta fase — ver seção 12).

---

## 5. Portal do Solicitante — `/portal/*`

Acesso: qualquer colaborador com usuário/senha (perfil "Solicitante" implícito).

- **`/portal/abrir-solicitacao`** — mesmo fluxo de criação de `SolicitacaoServico` (ver 4.4), com seletor de setor.
- **`/portal/cronograma-calibracao`** — consulta (somente leitura) das próximas datas de manutenção/calibração dos equipamentos do setor do usuário.
- **`/portal/inventario-setor`** — consulta (somente leitura) dos equipamentos do setor.

**Regra de negócio:** todas as 3 telas filtram automaticamente pelo setor vinculado ao usuário logado (não pode ver outros setores, exceto se tiver múltiplos setores associados — nesse caso, seletor).

---

## 6. Laudos Técnicos (padrão reutilizável)

Estrutura comum a todos os laudos (`FloatingWindow` kind `laudo-*`): cabeçalho (Equipamento/TAG, Nº do laudo, Data de execução, Responsável técnico) → abas (Geral | CheckList/Pontos/Testes | Não-Conformidades [Preventiva] | Anexos) → rodapé (Imprimir | Salvar | Salvar e Fechar | Cancelar).

**Responsável técnico:** campo obrigatório em Calibração e TSE (Recebimento/Preventiva usam apenas nome do técnico), vinculado ao cadastro de Pessoas (FK `responsavelTecnicoId`) — exibe o registro profissional (CREA/CRM/outro) armazenado no perfil da pessoa.

**Resultado "Aprovado com Ressalvas":** não gera nenhuma tarefa/ação automática — é um resultado normal, mas exige um campo `justificativaRessalva` obrigatório (texto livre) explicando por que o laudo foi aprovado mesmo fora dos padrões. Esse texto é impresso no certificado/documento final.

**Validade do certificado:** cada `Procedimento` de laudo tem um campo `validadeMeses` (default 12 = 1 ano), configurável — a validade pode variar por tipo de equipamento, por norma aplicada, e até por hospital/setor para o mesmo tipo (procedimentos distintos por combinação). O campo é sobrescrevível também no laudo individual quando um caso excepcional exigir.

**Entidade base `Laudo`:** id, tipo (enum: Recebimento|Preventiva|Calibração|TSE), numero, equipamentoTag*, osNumero (FK, exceto Recebimento), dataExecucao*, tecnicoResponsavel*, procedimentoId (FK Procedimento de Laudo), resultado (enum: Aprovado|Reprovado|Aprovado com Ressalvas), anexos[].

### 6.1 Laudo de Recebimento
Campos adicionais: fornecedor, notaFiscal, dataEmissao, situacaoEquipamentos, responsavelRecebimento, responsavelInstituicao, cargoInstituicao. Checklist personalizável por modelo (ver 6.5). Gera documento PDF/impressão com evidências anexadas (fotos, NF).

### 6.2 Laudo de Preventiva
Campos adicionais: próxima preventiva (data). Aba **Não-Conformidades**: itens marcados "Não" no checklist agregam-se automaticamente; botão único "Gerar OS Corretiva" cria UMA OS corretiva contendo todas as não-conformidades daquele laudo. Resultado calculado automaticamente (Reprovado se houver "Não"; Aprovado com Ressalvas se houver observação sem reprovação; Aprovado caso contrário) — editável manualmente pelo técnico.

**API:**
```
POST /api/laudos/preventiva
POST /api/laudos/preventiva/:id/gerar-os-corretiva
```

**Critérios de aceite:**
- Dado um checklist com 2 itens "Não", quando clico em "Gerar OS Corretiva", então UMA única OS é criada referenciando os 2 itens (não duas OS separadas).

### 6.3 Laudo de Calibração
Campos adicionais: instrumentoPadrao, certificadoRBC, criterioAceitacao (±%), responsavelTecnicoId* (FK Pessoas, com CREA exibido). Aba "Pontos de Calibração": tabela com pontos da faixa (ex: 0/25/50/75/100%), Valor Padrão × Valor do Equipamento → erro% e status Aprovado/Reprovado calculados por ponto. **Reprovação em qualquer ponto habilita "Gerar OS Corretiva"** (mesmo padrão da Preventiva — uma única OS agrega todos os pontos reprovados). cálculo automático de erro (%) e status Aprovado/Reprovado por ponto (`|erro| ≤ criterioAceitacao`). Resultado geral = Aprovado somente se todos os pontos aprovados.

### 6.4 Laudo de Segurança Elétrica (TSE)
Campos adicionais: instrumentoTse, norma (enum: fabrica|ec — Ensaio de Fábrica × NBR IEC 60601-1/Engenharia Clínica, com limites distintos por norma), responsavelTecnicoId* (FK Pessoas, com CREA exibido). Aba "Testes Elétricos": Aterramento, Isolamento, Fuga para Terra/Chassi/Paciente — cada um com limite (por norma), valor medido, status automático.

**Regra:** trocar a norma recalcula os limites e reavalia todos os testes já preenchidos. **Reprovação em qualquer teste habilita "Gerar OS Corretiva"** (mesmo padrão da Preventiva/Calibração).

### 6.5 Procedimentos de Laudo — `/equipamentos/modelos-checklist`
Tela administrativa única para os 4 tipos de laudo (Recebimento, Preventiva, Calibração, TSE). Cada "Procedimento" tem: nome, tipo, `validadeMeses` (default 12), itens (perguntas | pontos de calibração | testes elétricos — formato conforme o tipo), e pode ser vinculado a N fabricantes/modelos (aba "Equipamentos Vinculados", vínculo exclusivo — vincular a um procedimento desvincula de outro do mesmo tipo). Botão "+ Novo Procedimento" cria e abre o editor de itens direto.

**Regra de negócio central:** um POP (Procedimento Operacional Padrão) de manutenção preventiva pode estar vinculado a um Procedimento de Manutenção — o POP estabelece o procedimento, portanto o vínculo é bidirecional e navegável (POP → Procedimento e Procedimento → POP referenciado).

**API:**
```
GET   /api/procedimentos-laudo?tipo=
POST  /api/procedimentos-laudo               body:{nome, tipo}
PATCH /api/procedimentos-laudo/:id/itens
POST  /api/procedimentos-laudo/:id/vincular   body:{fabricanteModeloId}
```

---

## 7. Contratos — `/gestao/contratos`

**Dados:** numero, fornecedorId*, descricao, situacao (enum: Vigente|A Vencer|Vencido), vigenciaInicio, vigenciaFim, valor, equipamentosCobertos[] (matriz de cobertura), sla (texto estruturado: tempo de atendimento/solução), indiceReajuste (enum: IPCA|IGP-M), dataReajusteAniversario, glosas[] (data, valor, motivo).

**Regras de negócio:**
- **Vínculo N:N**: um equipamento pode estar coberto por mais de um contrato simultaneamente (ex: um contrato de peças + outro de mão de obra) — não há restrição de contrato único por equipamento.
- **Rateio de custo**: quando um contrato cobre múltiplos equipamentos, o valor do contrato é rateado **igualitariamente** entre todos os `equipamentosCobertos` (valor ÷ quantidade de equipamentos), refletido no custo total de cada equipamento na Ficha Vida.
- **Vencimento**: contrato vencido **não bloqueia** a abertura de OS vinculada a ele — apenas gera alerta (mesmo padrão não-bloqueante do Certificado de Calibração).
- **Alertas de vencimento**: gerados em 3 antecedências — 90, 60 e 30 dias antes de `vigenciaFim` — visíveis em Contratos Vencendo e no Dashboard, com severidade crescente conforme se aproxima o vencimento.
- SLA deve ser verificável contra o tempo real de atendimento das OS vinculadas (gerar alerta de possível glosa quando SLA estourado).
- Reajuste: sistema deve notificar 30 dias antes da data-aniversário do contrato.

**API:**
```
GET  /api/contratos?situacao=
GET  /api/contratos/:numero/matriz-cobertura
GET  /api/contratos/vencendo?dias=90,60,30
POST /api/contratos/:numero/glosas   body:{data, valor, motivo}
```

---

## 8. Estoque — `/estoque/*`

- **Itens em Estoque**: código, descrição, almoxarifado, qtdAtual, qtdMinima, qtdReservada (calculada a partir de reservas ativas), valorUnitário, status (Normal|Abaixo do Mínimo).
- **Movimentação de Estoque**: log de Entrada/Saída vinculado a OS.
- **Peças Abaixo do Mínimo**: ação "Solicitar Reposição" (cria requisição de compra) — apenas **alerta**, não bloqueia novas saídas.
- **Componentes Recuperados**: peça retirada de um equipamento (ex: sensor bom de equipamento sucateado) fica em **rastreamento separado obrigatório** — nunca retorna ao estoque normal como peça nova, por exigência regulatória brasileira (rastreabilidade de origem). Cadastro próprio: peça, equipamento de origem, data de retirada, situação (Em Rastreamento|Reaproveitada em <equipamento/OS>|Descartada).

**Regra de negócio central:** consumir uma peça em uma OS **deduz automaticamente** o saldo do item (`qtdAtual`) no momento do registro do item na OS — não existe etapa de confirmação por um almoxarife; a baixa é direta e imediata.

**Estoque negativo:** é **permitido** — o saldo pode ficar negativo (modelo de backorder), a baixa nunca é bloqueada por falta de saldo. Abaixo do mínimo apenas alerta (nunca bloqueia saída).

**API:**
```
GET   /api/estoque/itens?almoxarifado=
POST  /api/estoque/baixas               body:{itemCodigo, qtd, osNumero}  (dedução imediata, sem confirmação)
POST  /api/estoque/reposicoes           body:{itemCodigo}
GET   /api/estoque/componentes-recuperados
POST  /api/estoque/componentes-recuperados   body:{itemDescricao, equipamentoOrigemTag, dataRetirada}
PATCH /api/estoque/componentes-recuperados/:id   body:{situacao, equipamentoDestinoTag?, osDestinoNumero?}
```

**Critérios de aceite:**
- Dado um item com qtdAtual=2, quando uma OS consome 5 unidades, então o saldo fica −3 e a saída é registrada normalmente (sem bloqueio).
- Dado um componente retirado de um equipamento sucateado, quando cadastrado como "Componente Recuperado", então ele NUNCA aparece na lista de Itens em Estoque comum — permanece exclusivamente na lista de rastreamento até ser explicitamente destinado (reaproveitado ou descartado).

---

## 9. Pessoas — `/pessoas/*`

- **Colaboradores**: matrícula, nome, cargo, **carga atual** (nº de OS abertas atribuídas — calculado a partir de OS em andamento vinculadas ao técnico).
- **Equipes**: nome, turno, líder, membros — relação N:N (uma pessoa pode pertencer a mais de uma equipe simultaneamente).
- **Competências/Certificações**: colaborador, competência, nível, validade (com alerta de vencimento). Certificação vencida **não bloqueia** a atribuição de OS ao colaborador — apenas gera alerta visual no momento da atribuição.
- **Instrumentos e Padrões**: tela dedicada de rastreabilidade (`/pessoas/instrumentos-padroes`) para os instrumentos usados como padrão nos Laudos de Calibração/TSE (ex: analisadores Fluke). Cadastro: nome, nº de série, certificado de calibração próprio (nº, data de emissão, validade, laboratório emissor), histórico de uso (quais laudos usaram este instrumento como padrão). Alerta de vencimento do certificado do próprio instrumento — instrumento com certificado vencido não pode ser selecionado como `instrumentoPadrao`/`instrumentoTse` em um novo laudo (bloqueio, pois invalida o resultado da medição).

**Perfis de acesso:**
- **Engenheiro**: edição total em todos os módulos.
- **Gestor**: vê tudo e **pode editar** (mesmo nível de acesso do Engenheiro para fins de gestão) — distinção entre os dois é organizacional, não técnica.
- **Técnico**: pode executar/fechar OS atribuídas a si, preencher laudos e checklists; não edita cadastros mestres (Fabricante/Modelo/Plano de Descrições/Procedimentos).
- **Demais perfis (Solicitante, Auditoria)**: apenas leitura, exceto pelas telas específicas do Portal do Solicitante.

**Regra de negócio:** carga atual ≥2 deve destacar visualmente o colaborador (sobrecarga) para apoiar realocação pelo gestor.

---

## 10. Indicadores — `/gestao/indicadores`

Cards clicáveis com valor atual, meta, tendência; ao clicar, modal com histórico de 6 meses em gráfico de barras. Construtor de Indicadores permite compor novos indicadores a partir de campos de Equipamentos/OS/Contratos/Laudos/Certificados.

**API:**
```
GET /api/indicadores
GET /api/indicadores/:id/historico?meses=6
POST /api/indicadores/construtor   body:{nome, campos[], formula}
```

---

## 11. Auditorias — `/gestao/auditorias`

Escopo, responsável, data, status (Planejada|Em Execução|Concluída), achados → Não-Conformidades → Planos de Ação (vinculados). Modelo compatível com ISO 13485 / NRs aplicáveis.

**Status "Planejada":** é apenas um rascunho (auditoria criada mas ainda sem execução) — não exige agenda formal antecipada; some/vira "Em Execução" quando o trabalho de campo/registro de achados começa.

**Registro de Não Conformidade:** pode ser feito **tanto** por quem executa a auditoria (achado formal, vinculado a uma auditoria) **quanto** por qualquer perfil que perceba um problema fora do contexto de auditoria (ex: técnico abre NC diretamente a partir de uma OS) — campo `origem` diferencia "Auditoria AUD-xxx" de "Livre/OS-xxx".

**Reabertura de NC:** permitida após fechamento, com a **mesma exigência de justificativa obrigatória** usada no fechamento — reabrir gera log de auditoria (quem, quando, motivo).

**Plano de Ação vencido:** prazo expirado sem conclusão gera **escalonamento automático** — notificação ao gestor responsável (não fica apenas com destaque visual "atrasado" passivo).

---

## 12. Módulo Estratégico (Evolução)

- **Dashboard Executivo**: índice de maturidade (percentual + nível 1-5), índice de conformidade, disponibilidade, riscos críticos, evolução por domínio, prioridades do mês, documentos/contratos vencendo, recomendações (painel lateral).
- **Avaliação de Maturidade**: domínios com nível 1-5, gaps, evidências, plano de ação. **Índice de Maturidade do Dashboard é calculado automaticamente** a partir da média/ponderação dos níveis de todos os domínios avaliados — nunca um valor manual.
- **Jornada de Evolução**: stepper Diagnóstico → Priorização → Plano → Implantação → Evidências → Avaliação → Melhoria Contínua, com **navegação livre entre etapas** (sem gate de aprovação obrigatório para avançar).
- **Catálogo de Requisitos**: requisitos (normas RDC, NR, ISO etc.) vêm pré-cadastrados pelo administrador do sistema (Nexo) — usuários finais não criam requisitos livremente, apenas evidenciam conformidade contra os já existentes.
- **Central de Conformidade / Gestão de Evidências / Biblioteca de Conhecimento / Biblioteca de POPs**: gestão documental de conformidade normativa. **Vínculo POP ↔ Procedimento de Manutenção é 1:1** — cada POP gera exatamente um Procedimento de Manutenção correspondente (ver 6.5); para tipos de equipamento diferentes que exigem tratamentos distintos, cria-se um POP por tipo, cada um com seu próprio Procedimento vinculado.

---

## 13. App Mobile de Campo — `Nexo Mobile.dc.html`

PWA para técnico em campo. Telas: **Início** (saudação, KPIs Abertas/Urgentes/Concluídas hoje, próximos atendimentos, atalhos), **Minhas OS** (lista filtrável, badge de urgentes), **Execução de OS** (Checklist → Fotos/Peças → Finalizar com observações + assinatura digital do responsável do setor), **Ler QR** (simula leitura de etiqueta → Ficha do Equipamento), **Solicitar** (abrir Solicitação de Serviço do celular).

**Regras de negócio específicas:**
- Indicador online/offline: ações offline (fotos, peças, finalizar OS, enviar solicitação) entram numa fila local; badge mostra contagem pendente; ao reconectar, sincroniza e mostra flash de confirmação.
- Assinatura digital obrigatória antes de finalizar atendimento.
- Peças usadas na execução dão baixa/reserva no mesmo fluxo de Estoque da seção 8 (via API quando online; enfileiradas quando offline).

**API (mobile-specific, mesma base do backend):**
```
GET  /api/mobile/minhas-os?tecnicoId=
POST /api/mobile/os/:numero/checklist
POST /api/mobile/os/:numero/fotos           multipart
POST /api/mobile/os/:numero/pecas           body:{itemCodigo, qtd}
POST /api/mobile/os/:numero/finalizar       body:{observacoes, assinaturaBase64}
GET  /api/mobile/equipamento/qr/:codigo
POST /api/mobile/sync/queue                 (replay de ações offline, idempotente por client-id)
```

**Critérios de aceite:**
- Dado o app em modo offline, quando o técnico finaliza uma OS, então a ação fica na fila local e a UI mostra "finalizada — será sincronizada".
- Dado que a conexão volta, quando a fila tem 3 ações pendentes, então todas são reenviadas e a UI mostra "Sincronizado — 3 ações enviadas".

---

## 13.5 Financeiro — `/financeiro/*`

**Escopo:** módulo agrega e apresenta os custos já rastreados em outros módulos — não é um ERP financeiro. Não há orçamento/budget anual por centro de custo nem alçada de aprovação de gastos (o Nexo não substitui a cadeia de aprovação financeira já existente nos sistemas hospitalares — apenas informa).

**Fontes de dado agregadas:**
- Itens de Material/Mão de obra lançados em OS (via Estoque).
- Valor rateado de Contratos por equipamento (rateio igualitário, ver módulo 7).
- **Glosas de contrato**: entram como **lançamento financeiro negativo** vinculado ao contrato/OS de origem — reduzem o total apurado no período, não apenas um registro informativo.

**Telas:** Dashboard de custos por equipamento/setor/centro de custo, extrato de lançamentos (Material | Mão de obra | Rateio de Contrato | Glosa), exportável.

**Regra de negócio:** todo lançamento financeiro é derivado — não há criação manual de lançamento financeiro solto na tela; tudo nasce de uma OS, Contrato ou Glosa já registrada em seu módulo de origem.

**Dados (entidade `Equipamento`) — adicionar:** `registroAnvisa` (número), `validadeAnvisa` (data), `dataEndOfService` (fim de suporte do fabricante), `dataEndOfLife` (fim de vida útil declarado pelo fabricante). Quando `validadeAnvisa` vence, o equipamento perde a validação regulatória — não pode continuar em uso sem novo registro, entrando automaticamente em candidato a End of Service / End of Life.

## 13.6 Plano de Substituição Tecnológica / CAPEX / Plano Diretor — `/gestao/*`

- **Plano Diretor da Engenharia Clínica**: documento vivo, sem horizonte temporal fixo — atualizado continuamente, sem metas amarradas a um prazo de N anos.
- **Plano de Substituição Tecnológica**: lista candidatos a substituição com base em **critério combinado**: idade do equipamento, custo de manutenção acumulado, e regularidade (Anvisa vencida / End of Service / End of Life atingidos). O sistema apenas **lista e prioriza candidatos** — a decisão final de substituir é do engenheiro/gestor.
- **CAPEX**: pode nascer tanto de uma recomendação do Plano de Substituição Tecnológica quanto de **lançamento manual** direto pelo gestor (novo investimento não ligado a substituição, ex: expansão de capacidade). Todo item de CAPEX referencia opcionalmente o equipamento de origem (se for substituição) e tem: descrição, valor estimado, justificativa, status (Proposto|Aprovado|Executado).

## 13.7 Relatórios Executivos e Recomendações Institucionais — `/gestao/relatorios`

- **Relatórios pré-definidos** (não construídos livremente pelo usuário): conjunto fixo de templates (ex: Resumo Executivo Mensal, Conformidade Normativa, Custos de Manutenção, Maturidade da Engenharia Clínica) alimentados pelos dados já existentes nos módulos.
- **Formato de saída:** PDF e exportação para Excel — ambos disponíveis para todo relatório.
- **Geração:** suporta tanto geração manual sob demanda quanto **agendamento automático** (periodicidade configurável + envio por e-mail a uma lista de destinatários).
- **Recomendações Institucionais**: painel de recomendações derivado da Avaliação de Maturidade/Conformidade, exibido no Dashboard Executivo e replicável nos relatórios.

## 13.8 Configurações da Organização / Administração de Usuários — `/config/*`

- **Perfis customizáveis**: Engenheiro/Gestor/Técnico/Solicitante/Auditoria são perfis padrão de fábrica, mas o **administrador pode criar novos perfis** com permissões granulares (por módulo: nenhum|leitura|edição|edição+aprovação).
- **Multi-hospital/multi-estabelecimento**: um usuário pode ter acesso a mais de um hospital/estabelecimento simultaneamente, trocando pelo seletor de organização no cabeçalho — cada vínculo usuário↔estabelecimento pode ter um perfil diferente.
- **Log de auditoria de acesso**: obrigatório nesta fase — registra login/logout, troca de estabelecimento, e ações sensíveis (edição de permissões, exclusão/arquivamento), com timestamp e usuário.

---

## 14. Fora de Escopo desta Fase (registrar como próxima etapa)

- Estoque/Financeiro em profundidade completa (regras fiscais, centro de custo detalhado, orçamento/budget anual e alçadas de aprovação — ficam fora de escopo por design: o Nexo não substitui a cadeia de aprovação financeira já existente nos sistemas hospitalares).
- Auditorias formais com workflow de aprovação multi-etapa.
- Drag-and-drop no Quadro de Processos (Kanban).
- Sincronização offline real (a fila mobile hoje é simulada em memória, não em IndexedDB/Service Worker).
- Assinatura digital com validade jurídica (certificado ICP-Brasil).
- Multi-tenant real (seletor de organização/estabelecimento é visual, sem isolamento de dados por tenant ainda).

---

## 15. Dependências entre Telas (para ordem de implementação no Cursor)

1. Cadastros base: Fabricantes, Modelos, Fornecedores, Setores, Plano de Descrições.
2. Equipamentos (depende de 1).
3. Procedimentos de Laudo (depende de 2, para vínculo por modelo).
4. Ordens de Serviço + Estoque (peça) (depende de 2).
5. Laudos (depende de 3, 4).
6. Solicitações + Triagem (depende de 4).
7. Portal do Solicitante (depende de 6).
8. Certificados, Auditoria de OS, Histórico, Ficha Vida (depende de 2, 4, 5).
9. Contratos (independente, mas referenciado por 3 e 8).
10. Pessoas/Equipes (independente, referenciado por 4 como responsável).
11. Módulo Estratégico e Indicadores (consome dados de todos os anteriores — implementar por último).
12. App Mobile (consome as mesmas APIs de 4, 5, 6, 8 — implementar em paralelo ao backend, ao final do core).
