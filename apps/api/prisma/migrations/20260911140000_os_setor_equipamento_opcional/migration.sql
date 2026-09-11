-- OS de pedido do setor: equipamento opcional; setor da OS vem do pedido.
ALTER TABLE "OrdemServico" ALTER COLUMN "equipamentoId" DROP NOT NULL;
ALTER TABLE "OrdemServico" ADD COLUMN "setorId" TEXT;

UPDATE "OrdemServico" AS os
SET "setorId" = e."setorId"
FROM "Equipamento" AS e
WHERE os."equipamentoId" = e."id"
  AND os."setorId" IS NULL;

CREATE INDEX "OrdemServico_setorId_idx" ON "OrdemServico"("setorId");

ALTER TABLE "OrdemServico"
  ADD CONSTRAINT "OrdemServico_setorId_fkey"
  FOREIGN KEY ("setorId") REFERENCES "Setor"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
