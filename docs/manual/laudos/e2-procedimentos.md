# Procedimentos versionados (E2)

> Esqueleto — texto a ser escrito pelo Analista. Capturas: Tester, app local, contas `@aion.local` (nunca HEF/produção).

## 1. Criar um procedimento (nasce em rascunho)

<!-- TODO Analista: código único, título do laudo, tipo, Documento emitido (Laudo | Certificado), genérico, validade em meses, norma.
     Código repetido no mesmo estabelecimento é recusado. Procedimentos antigos continuam sem código até serem republicados. -->

![Tela: lista de procedimentos (CÓDIGO – TÍTULO vX (publicação dd/mm/aaaa))](img/e2-lista.png)
![Tela: novo procedimento](img/e2-novo.png)

## 2. Checklist em árvore

<!-- TODO Analista: seção › subseção › item (até 3 níveis); numeração automática; menu ⋮ (mover, recuar, avançar, Mover para…, duplicar, excluir);
     teclado: setas, Alt+↑/↓ move, Alt+→ aninha, Alt+← desaninha, Enter abre, Del exclui. Funciona sem arrastar e no celular. -->

![Tela: árvore do checklist](img/e2-arvore.png)
![Tela: menu ⋮ e Mover para…](img/e2-menu-mover.png)

## 3. Tipos de item e pontos

<!-- TODO Analista: Medição (grandeza, unidade, tipo de padrão, leitura, resolução, nº de leituras, ordem, referência e versão da tolerância),
     Verificação qualitativa (subitens Passa/Falha/N/A), Condições ambientais (T e UR mín/máx), Registro (não reprova).
     Limite por ponto: intervalo, nominal ± absoluto, nominal ± %, só máximo (≤ e <), só mínimo (≥), sem limite; exemplo ao vivo.
     Base do limite (nominal / valor convencional). Regra de decisão Direta (padrão) ou Considerando U (exige modelo de incerteza). -->

![Tela: item de medição com pontos](img/e2-item-medicao.png)

## 4. Procedimento-pai (herança)

<!-- TODO Analista: até 3 níveis, sem ciclo; derivado herda itens e pode ocultar ou sobrescrever tipo, resolução, nº de leituras, ordem e limites.
     O derivado fica na versão do pai que usou; quando o pai publica versão nova aparece "Procedimento pai tem versão N" e o derivado só muda ao ser republicado. -->

![Tela: itens herdados do pai](img/e2-heranca.png)
![Tela: aviso "Procedimento pai tem versão N"](img/e2-aviso-pai.png)

## 5. Aba Certificado, Anexos e Bibliografia

<!-- TODO Analista: título impresso (aviso de incoerência com o tipo), declaração padrão/própria, frase de liberação (só em APROVADO),
     ocultar padrões (só no PDF), data de execução, validade, memória de cálculo, assinaturas. Anexos e bibliografia como referências (sem upload nesta etapa). -->

![Tela: aba Certificado](img/e2-certificado.png)

## 6. Publicar e versões

<!-- TODO Analista: Publicar exige a permissão "Publicar procedimentos" (o administrador concede em Configurações › Usuários; nenhum perfil tem por padrão).
     Bloqueios impedem publicar (ex.: "Regra 'Considerando U' exige um modelo de incerteza. Vincule um modelo ou use a regra Direta.");
     avisos pedem confirmação (ponto sem limite, medição sem tolerância com referência). Publicado é somente leitura; Editar cria a próxima versão em rascunho.
     Laudos já emitidos mantêm itens, limites, regra e tipo do documento da versão usada. Aba Versões: comparar versões. -->

![Tela: diálogo Publicar com diferenças e avisos](img/e2-publicar.png)
![Tela: aba Versões](img/e2-versoes.png)
![Tela: Configurações › Usuários › Publica procedimentos](img/e2-permissao.png)

## 7. Inativar

<!-- TODO Analista: não existe excluir. Inativar tira o procedimento da emissão de laudos novos; laudos emitidos não mudam.
     Rascunho aberto antes da inativação ainda pode ser finalizado, com o aviso "Procedimento inativo: este rascunho pode ser finalizado com a versão já usada, mas o procedimento não emite laudos novos." -->

![Tela: rascunho de laudo com aviso de procedimento inativo](img/e2-laudo-procedimento-inativo.png)

## 8. Planos e modelos

<!-- TODO Analista: só procedimento publicado é vinculado a modelos e planos; o plano passa a apontar o procedimento (antigos continuam pelo código). -->
