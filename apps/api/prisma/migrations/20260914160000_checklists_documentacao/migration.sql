-- Checklists versionados, medições e relatório de serviço.
-- Aditivo: não apaga OS, inventário, laudos, planos nem estabelecimentos.

ALTER TYPE "ResultadoLaudo" ADD VALUE IF NOT EXISTS 'NAO_AVALIADO';

DO $$ BEGIN
  CREATE TYPE "StatusDocumentoLaudo" AS ENUM ('RASCUNHO', 'FINAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Estabelecimento"
  ADD COLUMN IF NOT EXISTS "diasAlertaCertificado" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "bloquearPadraoVencido" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ProcedimentoLaudo"
  ADD COLUMN IF NOT EXISTS "versao" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "criterioReferencia" TEXT,
  ADD COLUMN IF NOT EXISTS "criterioVersao" TEXT,
  ADD COLUMN IF NOT EXISTS "criterioAutorNome" TEXT,
  ADD COLUMN IF NOT EXISTS "criterioAtualizadoEm" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ProcedimentoLaudoVersao" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "procedimentoId" TEXT NOT NULL,
  "versao" INTEGER NOT NULL,
  "nome" TEXT NOT NULL,
  "tipo" "TipoLaudo" NOT NULL,
  "validadeMeses" INTEGER NOT NULL,
  "itens" JSONB NOT NULL,
  "criterioReferencia" TEXT,
  "criterioVersao" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "createdByNome" TEXT,
  CONSTRAINT "ProcedimentoLaudoVersao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProcedimentoLaudoVersao_procedimentoId_versao_key"
  ON "ProcedimentoLaudoVersao"("procedimentoId", "versao");
CREATE INDEX IF NOT EXISTS "ProcedimentoLaudoVersao_estabelecimentoId_idx"
  ON "ProcedimentoLaudoVersao"("estabelecimentoId");

DO $$ BEGIN
  ALTER TABLE "ProcedimentoLaudoVersao"
    ADD CONSTRAINT "ProcedimentoLaudoVersao_procedimentoId_fkey"
    FOREIGN KEY ("procedimentoId") REFERENCES "ProcedimentoLaudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "ProcedimentoLaudoVersao" (
  "id", "estabelecimentoId", "procedimentoId", "versao", "nome", "tipo", "validadeMeses",
  "itens", "criterioReferencia", "criterioVersao", "createdAt"
)
SELECT
  md5(p."id" || ':v1'),
  p."estabelecimentoId",
  p."id",
  COALESCE(p."versao", 1),
  p."nome",
  p."tipo",
  p."validadeMeses",
  COALESCE(p."itens", '[]'::jsonb),
  p."criterioReferencia",
  p."criterioVersao",
  p."createdAt"
FROM "ProcedimentoLaudo" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ProcedimentoLaudoVersao" v
  WHERE v."procedimentoId" = p."id" AND v."versao" = COALESCE(p."versao", 1)
);

ALTER TABLE "InstrumentoPadrao"
  ADD COLUMN IF NOT EXISTS "tipoAnalisador" TEXT,
  ADD COLUMN IF NOT EXISTS "identificacaoExterna" TEXT;

ALTER TABLE "Laudo"
  ADD COLUMN IF NOT EXISTS "statusDocumento" "StatusDocumentoLaudo" NOT NULL DEFAULT 'RASCUNHO',
  ADD COLUMN IF NOT EXISTS "procedimentoVersao" INTEGER,
  ADD COLUMN IF NOT EXISTS "procedimentoSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "instrumentoSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "visivelPortal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "finalizadoPorId" TEXT,
  ADD COLUMN IF NOT EXISTS "finalizadoPorNome" TEXT,
  ADD COLUMN IF NOT EXISTS "finalizadoEm" TIMESTAMP(3);

UPDATE "Laudo"
SET "statusDocumento" = 'FINAL'
WHERE "resultado" IN ('APROVADO', 'REPROVADO', 'APROVADO_COM_RESSALVAS')
  AND "statusDocumento" = 'RASCUNHO';

UPDATE "Laudo"
SET "procedimentoSnapshot" = "respostas"
WHERE "procedimentoSnapshot" IS NULL AND "respostas" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Laudo_estabelecimentoId_statusDocumento_idx"
  ON "Laudo"("estabelecimentoId", "statusDocumento");

CREATE TABLE IF NOT EXISTS "LaudoRevisao" (
  "id" TEXT NOT NULL,
  "laudoId" TEXT NOT NULL,
  "autorId" TEXT NOT NULL,
  "autorNome" TEXT NOT NULL,
  "justificativa" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respostasAntes" JSONB,
  "respostasDepois" JSONB,
  "resultadoAntes" TEXT,
  "resultadoDepois" TEXT,
  "statusAntes" TEXT,
  "statusDepois" TEXT,
  CONSTRAINT "LaudoRevisao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LaudoRevisao_laudoId_createdAt_idx"
  ON "LaudoRevisao"("laudoId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "LaudoRevisao"
    ADD CONSTRAINT "LaudoRevisao_laudoId_fkey"
    FOREIGN KEY ("laudoId") REFERENCES "Laudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
