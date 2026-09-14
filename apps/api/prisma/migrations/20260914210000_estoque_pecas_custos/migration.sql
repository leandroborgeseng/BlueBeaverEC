-- Peças, materiais e custos de manutenção (custo médio ponderado).
-- Não apaga lançamentos existentes. Itens de OS atuais ficam REALIZADO para preservar o extrato.

ALTER TABLE "Estabelecimento" ADD COLUMN IF NOT EXISTS "valorHoraMaoDeObra" DECIMAL(14,2);

ALTER TYPE "TipoItemOS" ADD VALUE IF NOT EXISTS 'SERVICO_EXTERNO';
ALTER TYPE "TipoItemOS" ADD VALUE IF NOT EXISTS 'OUTROS_DIRETOS';

CREATE TYPE "OrigemMaterialOS" AS ENUM ('ESTOQUE', 'COMPRA_DIRETA');
CREATE TYPE "NaturezaCustoOS" AS ENUM ('ESTIMADO', 'APROVADO', 'REALIZADO');
CREATE TYPE "DestinoFisicoMaterial" AS ENUM ('ESTOQUE', 'PERDA', 'USO_CONFIRMADO', 'OUTRO');

ALTER TABLE "OrdemServicoItem" ADD COLUMN IF NOT EXISTS "origemMaterial" "OrigemMaterialOS";
ALTER TABLE "OrdemServicoItem" ADD COLUMN IF NOT EXISTS "naturezaCusto" "NaturezaCustoOS" NOT NULL DEFAULT 'REALIZADO';
ALTER TABLE "OrdemServicoItem" ADD COLUMN IF NOT EXISTS "estornado" BOOLEAN NOT NULL DEFAULT false;

UPDATE "OrdemServicoItem"
SET "origemMaterial" = 'ESTOQUE'
WHERE "estoqueItemId" IS NOT NULL AND "origemMaterial" IS NULL;

ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "unidade" TEXT NOT NULL DEFAULT 'UN';
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "controlaLote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "lote" TEXT;
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "numeroSerie" TEXT;
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "validade" TIMESTAMP(3);
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "inativadoEm" TIMESTAMP(3);
ALTER TABLE "EstoqueItem" ADD COLUMN IF NOT EXISTS "inativadoMotivo" TEXT;

ALTER TYPE "TipoMovimentoEstoque" ADD VALUE IF NOT EXISTS 'DEVOLUCAO';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE IF NOT EXISTS 'AJUSTE';
ALTER TYPE "TipoMovimentoEstoque" ADD VALUE IF NOT EXISTS 'ESTORNO';

ALTER TABLE "EstoqueMovimento" ADD COLUMN IF NOT EXISTS "custoUnitario" DECIMAL(14,4);
ALTER TABLE "EstoqueMovimento" ADD COLUMN IF NOT EXISTS "documento" TEXT;
ALTER TABLE "EstoqueMovimento" ADD COLUMN IF NOT EXISTS "origem" TEXT;
ALTER TABLE "EstoqueMovimento" ADD COLUMN IF NOT EXISTS "destino" TEXT;
ALTER TABLE "EstoqueMovimento" ADD COLUMN IF NOT EXISTS "chaveIdempotencia" TEXT;
ALTER TABLE "EstoqueMovimento" ADD COLUMN IF NOT EXISTS "estornaMovimentoId" TEXT;
ALTER TABLE "EstoqueMovimento" ADD COLUMN IF NOT EXISTS "saldoApos" DECIMAL(12,2);

CREATE UNIQUE INDEX IF NOT EXISTS "EstoqueMovimento_estabelecimentoId_chaveIdempotencia_key"
  ON "EstoqueMovimento"("estabelecimentoId", "chaveIdempotencia")
  WHERE "chaveIdempotencia" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "EstoqueMovimento_osNumero_idx" ON "EstoqueMovimento"("osNumero");
CREATE INDEX IF NOT EXISTS "EstoqueMovimento_estabelecimentoId_chaveIdempotencia_idx"
  ON "EstoqueMovimento"("estabelecimentoId", "chaveIdempotencia");

CREATE TABLE IF NOT EXISTS "EstoqueCompatibilidade" (
    "id" TEXT NOT NULL,
    "estoqueItemId" TEXT NOT NULL,
    "modeloId" TEXT,
    "equipamentoId" TEXT,
    CONSTRAINT "EstoqueCompatibilidade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EstoqueCompatibilidade_estoqueItemId_idx" ON "EstoqueCompatibilidade"("estoqueItemId");
CREATE INDEX IF NOT EXISTS "EstoqueCompatibilidade_modeloId_idx" ON "EstoqueCompatibilidade"("modeloId");
CREATE INDEX IF NOT EXISTS "EstoqueCompatibilidade_equipamentoId_idx" ON "EstoqueCompatibilidade"("equipamentoId");

DO $$ BEGIN
  ALTER TABLE "EstoqueCompatibilidade"
    ADD CONSTRAINT "EstoqueCompatibilidade_estoqueItemId_fkey"
    FOREIGN KEY ("estoqueItemId") REFERENCES "EstoqueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EstoqueCompatibilidade"
    ADD CONSTRAINT "EstoqueCompatibilidade_modeloId_fkey"
    FOREIGN KEY ("modeloId") REFERENCES "Modelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EstoqueCompatibilidade"
    ADD CONSTRAINT "EstoqueCompatibilidade_equipamentoId_fkey"
    FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
