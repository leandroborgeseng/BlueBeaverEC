ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "complexidade" TEXT;
ALTER TABLE "OrdemServico" ADD COLUMN IF NOT EXISTS "projeto" TEXT;

CREATE TABLE IF NOT EXISTS "OsDominioValor" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "codigo" TEXT,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OsDominioValor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OsDominioValor_estabelecimentoId_tipo_nome_key"
  ON "OsDominioValor"("estabelecimentoId", "tipo", "nome");

CREATE INDEX IF NOT EXISTS "OsDominioValor_estabelecimentoId_tipo_idx"
  ON "OsDominioValor"("estabelecimentoId", "tipo");

ALTER TABLE "OsDominioValor"
  DROP CONSTRAINT IF EXISTS "OsDominioValor_estabelecimentoId_fkey";
ALTER TABLE "OsDominioValor"
  ADD CONSTRAINT "OsDominioValor_estabelecimentoId_fkey"
  FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
