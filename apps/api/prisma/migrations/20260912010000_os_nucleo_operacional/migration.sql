-- Núcleo operacional da OS: aguardando, comunicação, anexos, fechamento e reabertura.
-- Não destrutivo: só adiciona enum/colunas/tabelas.

ALTER TYPE "StatusOS" ADD VALUE IF NOT EXISTS 'AGUARDANDO';

DO $$ BEGIN
  CREATE TYPE "VisibilidadeOs" AS ENUM ('PUBLICO', 'INTERNO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CondicaoUsoEquipamento" AS ENUM ('APTO', 'RESTRITO', 'PARADO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "condicaoUso" "CondicaoUsoEquipamento" NOT NULL DEFAULT 'APTO';

ALTER TABLE "SolicitacaoServico" ADD COLUMN IF NOT EXISTS "solicitanteUsuarioId" TEXT;
ALTER TABLE "SolicitacaoServico" ADD COLUMN IF NOT EXISTS "equipamentoParado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SolicitacaoServico" ADD COLUMN IF NOT EXISTS "impacto" TEXT;

ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "motivoAguardo" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "diagnostico" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "servicoRealizado" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "resultadoAtendimento" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "condicaoFinal" "CondicaoUsoEquipamento";
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "equipamentoParado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "impactoInformado" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "identificacaoPendente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "pedidoReaberturaJustificativa" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "pedidoReaberturaEm" TIMESTAMP(3);
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "pedidoReaberturaPorId" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "textoConclusaoPublico" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "conclusaoSnapshot" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "atribuicaoVersao" INTEGER NOT NULL DEFAULT 0;

UPDATE "OrdemServico" SET "identificacaoPendente" = true WHERE "equipamentoId" IS NULL AND "identificacaoPendente" = false;

ALTER TABLE "LogOrdemServico" ADD COLUMN IF NOT EXISTS "visibilidade" "VisibilidadeOs" NOT NULL DEFAULT 'PUBLICO';

CREATE TABLE IF NOT EXISTS "OsComentario" (
  "id" TEXT NOT NULL,
  "ordemServicoId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "visibilidade" "VisibilidadeOs" NOT NULL DEFAULT 'PUBLICO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OsComentario_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OsAnexo" (
  "id" TEXT NOT NULL,
  "ordemServicoId" TEXT NOT NULL,
  "usuarioId" TEXT,
  "nomeArquivo" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "visibilidade" "VisibilidadeOs" NOT NULL DEFAULT 'PUBLICO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OsAnexo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OsComentario_ordemServicoId_createdAt_idx" ON "OsComentario"("ordemServicoId", "createdAt");
CREATE INDEX IF NOT EXISTS "OsAnexo_ordemServicoId_idx" ON "OsAnexo"("ordemServicoId");

DO $$ BEGIN
  ALTER TABLE "OsComentario" ADD CONSTRAINT "OsComentario_ordemServicoId_fkey"
    FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OsComentario" ADD CONSTRAINT "OsComentario_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OsAnexo" ADD CONSTRAINT "OsAnexo_ordemServicoId_fkey"
    FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "OsAnexo" ADD CONSTRAINT "OsAnexo_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
