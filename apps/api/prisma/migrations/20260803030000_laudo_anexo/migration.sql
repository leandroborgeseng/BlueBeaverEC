-- Anexos PDF originais de laudos/certificados
CREATE TABLE IF NOT EXISTS "LaudoAnexo" (
    "id" TEXT NOT NULL,
    "laudoId" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "conteudo" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LaudoAnexo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LaudoAnexo_laudoId_idx" ON "LaudoAnexo"("laudoId");

DO $$ BEGIN
  ALTER TABLE "LaudoAnexo" ADD CONSTRAINT "LaudoAnexo_laudoId_fkey"
    FOREIGN KEY ("laudoId") REFERENCES "Laudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
