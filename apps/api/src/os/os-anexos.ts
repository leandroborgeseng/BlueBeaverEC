import { BadRequestException } from "@nestjs/common";

const MAX_BYTES = 2_000_000;
const MIMES_OK = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export function parseAnexoDataUrl(dataUrl: string, nomeArquivo?: string) {
  const raw = dataUrl?.trim() ?? "";
  const m = /^data:([^;]+);base64,(.+)$/i.exec(raw);
  if (!m) throw new BadRequestException("Anexo inválido (use data URL base64)");
  const mimeType = m[1].toLowerCase();
  if (!MIMES_OK.has(mimeType)) {
    throw new BadRequestException("Anexo deve ser imagem ou PDF");
  }
  const buffer = Buffer.from(m[2], "base64");
  if (!buffer.length) throw new BadRequestException("Anexo vazio");
  if (buffer.length > MAX_BYTES) {
    throw new BadRequestException("Anexo maior que 2 MB");
  }
  const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] ?? "bin";
  return {
    mimeType,
    buffer,
    nomeArquivo: (nomeArquivo?.trim() || `anexo.${ext}`).slice(0, 180),
  };
}
