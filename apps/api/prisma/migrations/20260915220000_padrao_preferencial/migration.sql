-- Tabela nova: preferência de padrão por tipo. Não altera cadastros existentes.

CREATE TABLE IF NOT EXISTS "PadraoPreferencial" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "instrumentoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PadraoPreferencial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PadraoPreferencial_estabelecimentoId_tipo_key"
  ON "PadraoPreferencial"("estabelecimentoId", "tipo");

CREATE INDEX IF NOT EXISTS "PadraoPreferencial_estabelecimentoId_idx"
  ON "PadraoPreferencial"("estabelecimentoId");

CREATE INDEX IF NOT EXISTS "PadraoPreferencial_instrumentoId_idx"
  ON "PadraoPreferencial"("instrumentoId");

ALTER TABLE "PadraoPreferencial"
  DROP CONSTRAINT IF EXISTS "PadraoPreferencial_estabelecimentoId_fkey";
ALTER TABLE "PadraoPreferencial"
  ADD CONSTRAINT "PadraoPreferencial_estabelecimentoId_fkey"
  FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PadraoPreferencial"
  DROP CONSTRAINT IF EXISTS "PadraoPreferencial_instrumentoId_fkey";
ALTER TABLE "PadraoPreferencial"
  ADD CONSTRAINT "PadraoPreferencial_instrumentoId_fkey"
  FOREIGN KEY ("instrumentoId") REFERENCES "InstrumentoPadrao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
