# Importar equipamentos reais → Aion

## Fluxo

1. Você cola a tabela (Excel/CSV/print/texto) no Claude.
2. Claude devolve **apenas** um JSON no formato abaixo.
3. Você cola o JSON aqui no chat (ou salva em `apps/api/scripts/dados/equipamentos-reais.json`).
4. Rodamos o script de carga no banco do Aion.
5. Depois: PDFs de calibração/TSE entram como anexos (lista de caminhos no JSON).

---

## Prompt para colar no Claude

```
Você é um extrator de dados para o sistema Aion (engenharia clínica).

TAREFA: ler a tabela de equipamentos que eu vou colar e devolver APENAS um JSON válido (sem markdown, sem comentários, sem texto fora do JSON).

REGRAS:
1. Datas no formato ISO: YYYY-MM-DD. Se vier DD/MM/AAAA, converta. Se ambígua ou ilegível, use null.
2. Valores monetários como número (ex.: 12500.50). Remova R$, pontos de milhar e use ponto decimal.
3. Não invente dados. Se a célula estiver vazia, omita o campo ou use null.
4. Gere uma TAG única por equipamento:
   - Prefira patrimônio ou nº de série se parecerem códigos estáveis.
   - Senão: EQ-XXXX sequencial (EQ-0001, EQ-0002…).
5. "nome" = descrição funcional do equipamento (ex.: "Monitor multiparamétrico"), não a marca.
6. "planoDescricao" = categoria genérica (ex.: Monitor, Ventilador, Desfibrilador, Bomba de Infusão, Eletrocardiógrafo, Raio-X, Ultrassom, Autoclave, Outros).
7. Normalize fabricante/modelo/setor (trim, capitalize razoável). Não traduza nomes próprios.
8. Se houver data de calibração e/ou TSE (teste de segurança elétrica), preencha o bloco "laudos".
9. Se houver caminho/nome de arquivo PDF, coloque em laudos[].pdfArquivo (só o nome ou caminho relativo).
10. Inclua "meta" com contagens e lista de avisos (linhas puladas, datas duvidosas).

SCHEMA (siga exatamente):

{
  "meta": {
    "fonte": "descrição curta da tabela",
    "totalLinhas": 0,
    "totalEquipamentos": 0,
    "avisos": ["string"]
  },
  "equipamentos": [
    {
      "tag": "EQ-0001",
      "nome": "Monitor multiparamétrico",
      "planoDescricao": "Monitor",
      "fabricante": "Philips",
      "modelo": "IntelliVue MX450",
      "setor": "UTI Adulto",
      "patrimonio": "PAT-123",
      "nSerie": "SN-ABC",
      "registroAnvisa": "10312345678",
      "validadeAnvisa": "2028-12-31",
      "dataAquisicao": "2020-03-15",
      "dataInstalacao": "2020-04-02",
      "valorAquisicao": 45000.00,
      "situacao": "ATIVO",
      "observacao": null,
      "laudos": [
        {
          "tipo": "CALIBRACAO",
          "dataExecucao": "2025-06-10",
          "validadeAte": "2026-06-10",
          "resultado": "APROVADO",
          "pdfArquivo": "anexos/EQ-0001-calibracao.pdf"
        },
        {
          "tipo": "TSE",
          "dataExecucao": "2025-06-10",
          "validadeAte": "2026-06-10",
          "resultado": "APROVADO",
          "pdfArquivo": "anexos/EQ-0001-tse.pdf"
        }
      ]
    }
  ]
}

situacao permitida: ATIVO | EM_GARANTIA | EM_GARANTIA_ESTENDIDA | INATIVO | ARQUIVADO
tipo de laudo: CALIBRACAO | TSE
resultado: APROVADO | REPROVADO | APROVADO_COM_RESSALVAS

Agora extraia desta tabela:

<<<COLAR A TABELA AQUI>>>
```

---

## Depois de extrair

- Cole o JSON no chat e peça: **“importe estes equipamentos no Aion”**
- Ou salve o arquivo e rode:

```bash
cd apps/api
pnpm prisma migrate deploy
pnpm exec tsx scripts/import-equipamentos-reais.ts scripts/dados/equipamentos-reais.json
```

PDFs: deixe os arquivos em `apps/api/scripts/dados/anexos/` com os nomes listados em `pdfArquivo`. O upload físico dos anexos pode ser feito num segundo passo.
