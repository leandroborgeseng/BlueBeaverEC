-- Planos de manutenção + enums
DO $$ BEGIN
  ALTER TYPE "TipoOS" ADD VALUE IF NOT EXISTS 'QUALIFICACAO';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "TipoLaudo" ADD VALUE IF NOT EXISTS 'QUALIFICACAO';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ResultadoLaudo" ADD VALUE IF NOT EXISTS 'PENDENTE_ASSINATURA';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoTestePlano" AS ENUM ('PREVENTIVA', 'CALIBRACAO', 'TSE', 'QUALIFICACAO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TipoEquipamentoPlano" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TipoEquipamentoPlano_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TipoEquipamentoPlano_estabelecimentoId_nome_key"
  ON "TipoEquipamentoPlano"("estabelecimentoId", "nome");

DO $$ BEGIN
  ALTER TABLE "TipoEquipamentoPlano" ADD CONSTRAINT "TipoEquipamentoPlano_estabelecimentoId_fkey"
    FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PlanoTeste" (
    "id" TEXT NOT NULL,
    "tipoEquipamentoPlanoId" TEXT NOT NULL,
    "tipoTeste" "TipoTestePlano" NOT NULL,
    "periodicidadeMeses" INTEGER NOT NULL,
    "procedimentoCodigo" TEXT NOT NULL,
    "parametrosFaixa" TEXT,
    "tolerancias" TEXT,
    "classeTse" TEXT,
    "tipoParteAplicada" TEXT,
    "pontoAplicacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanoTeste_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanoTeste_tipoEquipamentoPlanoId_tipoTeste_key"
  ON "PlanoTeste"("tipoEquipamentoPlanoId", "tipoTeste");

CREATE INDEX IF NOT EXISTS "PlanoTeste_procedimentoCodigo_idx" ON "PlanoTeste"("procedimentoCodigo");

DO $$ BEGIN
  ALTER TABLE "PlanoTeste" ADD CONSTRAINT "PlanoTeste_tipoEquipamentoPlanoId_fkey"
    FOREIGN KEY ("tipoEquipamentoPlanoId") REFERENCES "TipoEquipamentoPlano"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "tipoEquipamentoPlanoId" TEXT;
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "planoMatchTipo" TEXT;
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "planoMatchObs" TEXT;

CREATE INDEX IF NOT EXISTS "Equipamento_tipoEquipamentoPlanoId_idx" ON "Equipamento"("tipoEquipamentoPlanoId");

DO $$ BEGIN
  ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_tipoEquipamentoPlanoId_fkey"
    FOREIGN KEY ("tipoEquipamentoPlanoId") REFERENCES "TipoEquipamentoPlano"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Laudo" ADD COLUMN IF NOT EXISTS "planoTesteId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Laudo" ADD CONSTRAINT "Laudo_planoTesteId_fkey"
    FOREIGN KEY ("planoTesteId") REFERENCES "PlanoTeste"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
