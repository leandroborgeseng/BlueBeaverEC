-- Onda 7: snapshots de indicadores por estabelecimento (evita colisão multi-tenant)
DELETE FROM "IndicadorSnapshot";

ALTER TABLE "IndicadorSnapshot" ADD COLUMN IF NOT EXISTS "estabelecimentoId" TEXT;

-- Remove órfãos sem estabelecimento válido (já limpamos; garante NOT NULL)
UPDATE "IndicadorSnapshot" s
SET "estabelecimentoId" = (
  SELECT e.id FROM "Estabelecimento" e ORDER BY e."createdAt" ASC LIMIT 1
)
WHERE s."estabelecimentoId" IS NULL OR s."estabelecimentoId" = '';

ALTER TABLE "IndicadorSnapshot" ALTER COLUMN "estabelecimentoId" SET NOT NULL;

DROP INDEX IF EXISTS "IndicadorSnapshot_indicadorId_periodo_key";
CREATE UNIQUE INDEX "IndicadorSnapshot_indicadorId_estabelecimentoId_periodo_key"
  ON "IndicadorSnapshot"("indicadorId", "estabelecimentoId", "periodo");
CREATE INDEX "IndicadorSnapshot_estabelecimentoId_periodo_idx"
  ON "IndicadorSnapshot"("estabelecimentoId", "periodo");

DO $$ BEGIN
  ALTER TABLE "IndicadorSnapshot"
    ADD CONSTRAINT "IndicadorSnapshot_estabelecimentoId_fkey"
    FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
