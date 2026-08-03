-- PDF binário na biblioteca de POPs (pré-visualização)
ALTER TABLE "Pop" ADD COLUMN IF NOT EXISTS "mimeType" TEXT DEFAULT 'application/pdf';
ALTER TABLE "Pop" ADD COLUMN IF NOT EXISTS "conteudo" BYTEA;
