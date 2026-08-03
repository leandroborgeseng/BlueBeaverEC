-- Biblioteca de POPs: categoria + metadados de arquivo
DO $$ BEGIN
  CREATE TYPE "CategoriaPop" AS ENUM ('PREVENTIVA', 'CALIBRACAO', 'TSE', 'QUALIFICACAO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Pop" ADD COLUMN IF NOT EXISTS "categoria" "CategoriaPop";
ALTER TABLE "Pop" ADD COLUMN IF NOT EXISTS "equipamentoTitulo" TEXT;
ALTER TABLE "Pop" ADD COLUMN IF NOT EXISTS "nomeArquivo" TEXT;
ALTER TABLE "Pop" ADD COLUMN IF NOT EXISTS "tamanhoBytes" INTEGER;

CREATE INDEX IF NOT EXISTS "Pop_estabelecimentoId_categoria_idx"
  ON "Pop"("estabelecimentoId", "categoria");
