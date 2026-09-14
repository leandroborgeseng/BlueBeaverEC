import { LABEL_CONDICAO_USO, LABEL_STATUS_OS, type CondicaoUsoEquipamento, type StatusOS } from "@aion/shared";

export function labelStatusOS(status?: string | null) {
  if (status && status in LABEL_STATUS_OS) return LABEL_STATUS_OS[status as StatusOS];
  return status?.replace(/_/g, " ") ?? "—";
}

export function labelCondicaoUso(v?: string | null) {
  if (v && v in LABEL_CONDICAO_USO) return LABEL_CONDICAO_USO[v as CondicaoUsoEquipamento];
  return v?.replace(/_/g, " ") ?? "—";
}

const LABEL_ACAO_OS: Record<string, string> = {
  ABERTURA: "Abertura",
  ATRIBUICAO: "Atribuída",
  TRANSFERENCIA: "Transferida ao segundo profissional",
  IDENTIFICACAO_EQUIPAMENTO: "Equipamento identificado",
  IDENTIFICACAO_SETOR: "Setor identificado",
  PRIORIDADE_TECNICA: "Prioridade técnica definida",
  INICIO_EXECUCAO: "Atendimento iniciado",
  PAUSA: "Pausada",
  AGUARDO: "Em aguardo",
  RETOMADA: "Atendimento retomado",
  FECHAMENTO: "Concluída",
  CANCELAMENTO: "Cancelada",
  REABERTURA: "Reaberta",
  PEDIDO_REABERTURA: "Pedido de reabertura",
  COMENTARIO: "Atualização",
  ANEXO: "Anexo",
  DIAGNOSTICO: "Diagnóstico",
  ITEM_OS: "Item registrado",
  CHECKLIST_MOBILE: "Checklist de campo",
  FOTOS_MOBILE: "Fotos de campo",
  PECAS: "Peças",
  SERVICO_EXECUTADO: "Serviço executado",
  ASSINATURA_MOBILE: "Assinatura de campo",
};

export function labelAcaoOS(acao?: string | null) {
  if (!acao) return "Atualização";
  return LABEL_ACAO_OS[acao] ?? acao.replace(/_/g, " ");
}

export async function filesToAnexos(files: FileList | File[] | null) {
  const list = files ? Array.from(files).slice(0, 5) : [];
  const anexos: Array<{ dataUrl: string; nomeArquivo: string }> = [];
  for (const file of list) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    anexos.push({ dataUrl, nomeArquivo: file.name });
  }
  return anexos;
}
