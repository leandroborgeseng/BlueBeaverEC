export const OS_DOMINIO_TIPOS = [
  "OCORRENCIA",
  "CAUSA",
  "SERVICO",
  "PENDENCIA",
  "OFICINA",
  "COMPLEXIDADE",
  "PROJETO",
  "TIPO_ANEXO",
  "PAPEL_ASSINATURA",
  "METODO_CUSTO",
  "MOTIVO_CANCELAMENTO",
  "MOTIVO_AGUARDO",
  "MOTIVO_REABERTURA",
  "AVALIACAO_SERVICO",
  "ALMOXARIFADO",
] as const;

export type OsDominioTipo = (typeof OS_DOMINIO_TIPOS)[number];

export const LABEL_OS_DOMINIO: Record<OsDominioTipo, string> = {
  OCORRENCIA: "Ocorrência",
  CAUSA: "Causa",
  SERVICO: "Serviço",
  PENDENCIA: "Pendência",
  OFICINA: "Oficina",
  COMPLEXIDADE: "Complexidade",
  PROJETO: "Projeto",
  TIPO_ANEXO: "Tipo de anexo",
  PAPEL_ASSINATURA: "Papel da assinatura",
  METODO_CUSTO: "Método de apropriação de custos",
  MOTIVO_CANCELAMENTO: "Motivo de cancelamento / baixa da OS",
  MOTIVO_AGUARDO: "Motivo de aguardo",
  MOTIVO_REABERTURA: "Motivo de reabertura",
  AVALIACAO_SERVICO: "Avaliação do serviço externo",
  ALMOXARIFADO: "Almoxarifado",
};

export const OS_DOMINIO_TELA: Record<OsDominioTipo, string> = {
  OCORRENCIA: "Ocorrência/Serviço, Mão de Obra, Serviço Externo",
  CAUSA: "Ocorrência/Serviço, Mão de Obra, Serviço Externo",
  SERVICO: "Ocorrência/Serviço, Mão de Obra, Serviço Externo",
  PENDENCIA: "Pendência",
  OFICINA: "Ficha da OS",
  COMPLEXIDADE: "Ficha da OS",
  PROJETO: "Ficha da OS",
  TIPO_ANEXO: "Anexos",
  PAPEL_ASSINATURA: "Assinatura",
  METODO_CUSTO: "Serviço Externo",
  MOTIVO_CANCELAMENTO: "Cancelar OS",
  MOTIVO_AGUARDO: "Colocar em aguardo",
  MOTIVO_REABERTURA: "Reabrir OS",
  AVALIACAO_SERVICO: "Serviço Externo",
  ALMOXARIFADO: "Material",
};

export const OS_DOMINIO_PADROES: Record<OsDominioTipo, Array<{ codigo?: string; nome: string }>> = {
  OCORRENCIA: [
    { codigo: "ABERT", nome: "ABERTURA DE CHAMADO" },
    { codigo: "CORR", nome: "CORRETIVA" },
    { codigo: "PREV", nome: "PREVENTIVA" },
    { codigo: "CAL", nome: "CALIBRAÇÃO" },
  ],
  CAUSA: [
    { nome: "NÃO INFORMADA" },
    { nome: "DESGASTE" },
    { nome: "FALHA ELÉTRICA" },
    { nome: "FALHA MECÂNICA" },
    { nome: "USO INDEVIDO" },
  ],
  SERVICO: [
    { nome: "VERIFICAÇÃO" },
    { nome: "AJUSTE" },
    { nome: "LIMPEZA" },
    { nome: "SUBSTITUIÇÃO DE PEÇA" },
    { nome: "NÃO INFORMADO" },
  ],
  PENDENCIA: [
    { codigo: "PEC", nome: "AGUARDANDO PEÇA" },
    { codigo: "ACES", nome: "AGUARDANDO ACESSO" },
    { codigo: "FORN", nome: "AGUARDANDO FORNECEDOR" },
    { codigo: "LAUD", nome: "AGUARDANDO LAUDO" },
  ],
  OFICINA: [{ nome: "OFICINA CENTRAL" }, { nome: "CAMPO" }, { nome: "UTI" }, { nome: "CME" }],
  COMPLEXIDADE: [{ nome: "BAIXA" }, { nome: "MÉDIA" }, { nome: "ALTA" }],
  PROJETO: [],
  TIPO_ANEXO: [
    { nome: "Laudo" },
    { nome: "Foto" },
    { nome: "NF" },
    { nome: "Orçamento" },
    { nome: "Checklist" },
    { nome: "Outro" },
  ],
  PAPEL_ASSINATURA: [
    { nome: "Técnico Responsável" },
    { nome: "Solicitante" },
    { nome: "Engenheiro Clínico" },
    { nome: "Testemunha" },
  ],
  METODO_CUSTO: [
    { nome: "Mediante execução dos serviço" },
    { nome: "Nota fiscal" },
    { nome: "Contrato" },
  ],
  MOTIVO_CANCELAMENTO: [
    { nome: "Duplicidade" },
    { nome: "Aberto por engano" },
    { nome: "Solicitante desistiu" },
    { nome: "Equipamento desativado" },
    { nome: "Sem acesso ao equipamento" },
  ],
  MOTIVO_AGUARDO: [
    { nome: "Aguardando peça" },
    { nome: "Aguardando fornecedor" },
    { nome: "Aguardando acesso" },
    { nome: "Aguardando laudo" },
  ],
  MOTIVO_REABERTURA: [{ nome: "Recidiva da falha" }, { nome: "Solicitante pediu reabertura" }],
  AVALIACAO_SERVICO: [{ nome: "Bom" }, { nome: "Regular" }, { nome: "Ruim" }],
  ALMOXARIFADO: [{ nome: "Principal" }],
};

export function ehOsDominioTipo(v: string): v is OsDominioTipo {
  return (OS_DOMINIO_TIPOS as readonly string[]).includes(v);
}
