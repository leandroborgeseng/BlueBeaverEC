-- E1 (laudos v2): probabilidade de abrangência opcional (certificado e ponto); k sem default.
-- Só aditiva/relaxante: nenhuma linha é reescrita, sem backfill.

-- AlterTable
ALTER TABLE "CertificadoPadrao" ADD COLUMN "probabilidadeAbrangencia" DOUBLE PRECISION,
ALTER COLUMN "fatorAbrangencia" DROP NOT NULL,
ALTER COLUMN "fatorAbrangencia" DROP DEFAULT;

-- AlterTable
ALTER TABLE "CertificadoPadraoPonto" ADD COLUMN "probabilidadeAbrangencia" DOUBLE PRECISION,
ALTER COLUMN "fatorK" DROP DEFAULT;
