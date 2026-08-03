Estou implementando o módulo de planos de manutenção do sistema Aion (engenharia clínica). Já existe uma base de equipamentos importada (schema abaixo). Preciso agora importar a lógica de periodicidade e tipos de teste por tipo de equipamento, e deixar o sistema pronto para receber laudos em PDF (calibração, TSE, preventiva, qualificação) vinculando cada um ao equipamento e à ordem de serviço correta.

## Arquivos fornecidos

1. **`planos_manutencao_referencia.json`** — catálogo com 131 tipos genéricos de equipamento (fonte: planilha oficial de procedimentos do hospital). Cada item tem até 4 blocos, qualquer um pode ser `null` se não aplicável:
   - `preventiva`: `periodicidade` (texto tipo "06 meses"), `procedimento` (código POP, ex. "POP.EC.MP.011")
   - `calibracao`: `periodicidade`, `parametrosFaixa` (texto livre, pode ter múltiplas linhas), `tolerancias`, `procedimento` (código POP.EC.CAL.xxx)
   - `segurancaEletrica`: `periodicidade`, `classe` (I/II), `tipo` (B/BF/CF), `pontoAplicacao`, `procedimento` (código POP.EC.SEG.xxx)
   - `qualificacao`: `periodicidade`, `procedimento` (código POP.EC.QLF.xxx)

2. **`equipamento_plano_mapping.json`** — de-para entre o nome padronizado de cada equipamento (já usado no cadastro atual) e a linha correspondente do catálogo acima. Campo `tipoMatch` indica a confiança do vínculo:
   - `"exato"` (246 equipamentos): nome bate diretamente com uma linha do catálogo.
   - `"aproximado"` (74 equipamentos): não existe linha idêntica; usei a mais próxima clinicamente. Campo `observacao` explica a ressalva (ex.: cama Fawler mecânica vs. "Cama elétrica" — se for mecânica, o bloco de TSE não deve ser aplicado).
   - `"sem_correspondencia"` (74 equipamentos): mobiliário/acessórios sem exigência de calibração/TSE na planilha de origem (cadeiras de rodas, carros de transporte, mesas ginecológicas, etc.) — não têm plano associado; sugiro cadastrá-los sem plano de calibração/TSE, só com uma preventiva a definir manualmente se a engenharia clínica quiser.

3. **`nexo_extract_v2.json`** — a base de 394 equipamentos já com o campo `planoManutencao` embutido em cada item (mesma estrutura do mapping acima, já resolvida por equipamento). Use este arquivo para popular o banco — ele substitui a versão anterior sem plano.

## O que preciso que você implemente

1. **Tabela/entidade `TipoEquipamentoPlano`**: seed a partir de `planos_manutencao_referencia.json`. Cada um dos 4 blocos (preventiva, calibração, segurança elétrica, qualificação) vira uma linha em uma tabela `PlanoTeste` (ou equivalente), com `tipoTeste` enum (`PREVENTIVA | CALIBRACAO | TSE | QUALIFICACAO`), `periodicidadeMeses` (converter o texto "06 meses"/"12 meses" para inteiro), `procedimentoCodigo`, e os campos específicos de cada tipo (parâmetros/tolerâncias para calibração; classe/tipo/ponto de aplicação para TSE).

2. **Vínculo `Equipamento.tipoEquipamentoPlanoId`**: ligar cada equipamento ao seu `TipoEquipamentoPlano` usando `equipamento_plano_mapping.json` (já resolvido em `nexo_extract_v2.json`). Equipamentos com `tipoMatch = "sem_correspondencia"` ficam sem vínculo (planoTesteId nulo) — não invente periodicidade para eles.

3. **Geração automática de Ordem de Serviço**: para cada equipamento com plano vinculado, ao concluir um teste (import de laudo), calcular `proximaExecucao = dataExecucao + periodicidadeMeses` e criar/atualizar uma `OrdemServico` com status `ABERTA` vencendo nessa data. Ao importar um novo laudo do mesmo tipo, marcar a OS anterior como `CONCLUIDA` e abrir a próxima.

4. **Import de PDFs por nome de arquivo**: os laudos serão nomeados assim (já é o padrão que estou usando para os arquivos que vou te passar):
   ```
   {numeroSerieOuPatrimonio}_{codigoProcedimento}_{data ISO}.pdf
   ex.: 7702_POP.EC.CAL.009_2026-05-05.pdf
        7702_POP.EC.SEG.008_2026-05-04.pdf
   ```
   Use o `codigoProcedimento` (não só "CALIBRACAO"/"TSE" genérico) para casar o laudo com a linha exata do `PlanoTeste` — isso já identifica o tipo de teste E o tipo de equipamento esperado, então valide que o `codigoProcedimento` do arquivo bate com o `tipoEquipamentoPlano` do equipamento encontrado pela série/patrimônio (se não bater, sinalizar para revisão manual em vez de importar silenciosamente).

5. **Validação de laudo antes de aceitar como concluído**: nos primeiros PDFs que processei manualmente, percebi que os laudos de TSE de um lote vieram com o campo interno `Estado: Em execução` e a área de assinatura em branco — ou seja, o teste ainda não foi formalmente encerrado/assinado pelo laboratório, mesmo que os valores individuais estejam dentro do critério. Sugiro que o parser de PDF cheque por esse tipo de marcador de "documento não finalizado" (estado/status interno do PDF, ausência de assinatura ou data de emissão) e, se encontrar, importe o anexo mas marque o laudo como `PENDENTE_ASSINATURA` em vez de `APROVADO`, para não fechar a Ordem de Serviço com base em um documento ainda em aberto.

## Observação sobre os dados

`nexo_extract_v2.json` também carrega, no campo `meta.avisos`, os alertas já conhecidos da base (registros ANVISA não verificados oficialmente, equipamentos sem fabricante/modelo na fonte, etc.) — vale exibir isso em algum lugar da tela de auditoria/importação para o usuário revisar depois.
