# Padrões rastreáveis e certificados (E1)

> Esqueleto — texto a ser escrito pelo Analista. Capturas: Tester, app local, contas `@aion.local`.

## 1. Cadastrar um padrão

<!-- TODO Analista: nº de série único, tipo de analisador, grandezas, faixa, resolução; selo "cadastro incompleto". -->

![Tela: lista de padrões](img/e1-lista-padroes.png)
![Tela: cadastro de padrão](img/e1-cadastro-padrao.png)

## 2. Cadastrar certificado e pontos

<!-- TODO Analista: número, emissão/validade, laboratório e RBC, PDF; pontos (unidade, nominal, VVC, U > 0). -->

![Tela: cadastro de certificado](img/e1-certificado.png)
![Tela: pontos do certificado](img/e1-certificado-pontos.png)

## 3. k e probabilidade de abrangência (herança)

<!-- TODO Analista: ponto sobrescreve o certificado; vazio herda; sem nenhum dos dois o cadastro é bloqueado (k) ou aparece "não informada" (probabilidade). -->

![Tela: k herdado do certificado](img/e1-heranca-k.png)

## 4. Editar certificado × cadastrar revisão

<!-- TODO Analista: sem uso em laudo final edita no lugar (auditado); usado em laudo final só observações mudam;
     demais alterações exigem "Cadastrar revisão" — o laudo emitido mantém o certificado e o PDF originais. -->

![Tela: editar certificado sem uso](img/e1-editar-certificado.png)
![Tela: aviso de certificado usado e botão Cadastrar revisão](img/e1-certificado-usado.png)
![Tela: formulário de revisão preenchido](img/e1-revisao.png)

## 5. Alertas de vencimento

<!-- TODO Analista: janela de alerta (padrão 60 dias), sino e dashboard, dia civil de São Paulo, padrão sem certificado. -->

![Tela: sino com alerta de vencimento](img/e1-alerta-sino.png)
![Tela: dashboard de padrões](img/e1-alerta-dashboard.png)

## 6. Laudo: k, U e probabilidade no PDF

<!-- TODO Analista: bloqueio B16 ("Ponto N: k não informado no certificado do padrão") e U > 0 na finalização. -->

![Tela: PDF do laudo com k/U/probabilidade](img/e1-pdf-laudo.png)

## Capturas necessárias (Tester)

| Arquivo | Tela | Dados de teste (`@aion.local`) | Estado |
|---|---|---|---|
| e1-lista-padroes.png | /instrumentos | 3 padrões fictícios, 1 com selo incompleto | lista carregada |
| e1-cadastro-padrao.png | /instrumentos/[id] — dados do padrão | padrão "ESA612 teste", SN fictício | formulário preenchido |
| e1-certificado.png | /instrumentos/[id] — novo certificado | certificado C-TESTE-1, lab fictício, PDF de exemplo | antes de salvar |
| e1-certificado-pontos.png | /instrumentos/[id] — pontos | 3 pontos (V), 1 sem k (herda) | antes de salvar |
| e1-heranca-k.png | /instrumentos/[id] — tabela de pontos | certificado k=2, ponto sem k | após salvar ("herdado") |
| e1-editar-certificado.png | /instrumentos/[id] — Editar certificado | certificado sem laudo final | formulário preenchido |
| e1-certificado-usado.png | /instrumentos/[id] — certificado usado | certificado usado em laudo FINAL de teste | aviso + botão "Cadastrar revisão" |
| e1-revisao.png | /instrumentos/[id] — revisão | revisão 1 pré-preenchida | antes de salvar |
| e1-alerta-sino.png | sino de notificações | certificado vencendo em ≤ 60 dias | sino aberto |
| e1-alerta-dashboard.png | dashboard | 1 vencido, 1 a vencer | cartão de padrões |
| e1-pdf-laudo.png | PDF do laudo de calibração | laudo FINAL de teste, probabilidade vazia | seção "Instrumento na data do serviço" com "não informada" |
