import { LABEL_CONDICAO_USO, LABEL_STATUS_OS, type CondicaoUsoEquipamento, type StatusOS } from "@aion/shared";

export function labelStatusOS(status?: string | null) {
  if (status && status in LABEL_STATUS_OS) return LABEL_STATUS_OS[status as StatusOS];
  return status?.replace(/_/g, " ") ?? "—";
}

export function labelCondicaoUso(v?: string | null) {
  if (v && v in LABEL_CONDICAO_USO) return LABEL_CONDICAO_USO[v as CondicaoUsoEquipamento];
  return v?.replace(/_/g, " ") ?? "—";
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
