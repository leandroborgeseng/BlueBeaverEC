-- E1 (laudos v2): revisão explícita de certificado de padrão (decisão TL 20/10).
-- Colunas nulas, sem default, sem backfill; nenhuma linha reescrita.
-- Troca do índice único (instrumentoId, numero) por (instrumentoId, numero, revisao) + índice único
-- PARCIAL (instrumentoId, numero) WHERE revisao IS NULL, que mantém o original único no banco.
-- O índice parcial existe só em SQL (Prisma não expressa índice parcial).

-- DropIndex
DROP INDEX "CertificadoPadrao_instrumentoId_numero_key";

-- AlterTable
ALTER TABLE "CertificadoPadrao" ADD COLUMN "revisao" INTEGER,
ADD COLUMN "revisaoDeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoPadrao_instrumentoId_numero_revisao_key" ON "CertificadoPadrao"("instrumentoId", "numero", "revisao");

-- AddForeignKey
ALTER TABLE "CertificadoPadrao" ADD CONSTRAINT "CertificadoPadrao_revisaoDeId_fkey" FOREIGN KEY ("revisaoDeId") REFERENCES "CertificadoPadrao"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CreateIndex (parcial; fora do schema.prisma)
CREATE UNIQUE INDEX "CertificadoPadrao_instrumentoId_numero_original_key" ON "CertificadoPadrao"("instrumentoId", "numero") WHERE "revisao" IS NULL;
