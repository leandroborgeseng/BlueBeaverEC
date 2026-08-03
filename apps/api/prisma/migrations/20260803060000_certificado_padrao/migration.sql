-- Cadastro metrológico de padrões: campos extras + histórico de certificados com pontos

ALTER TABLE "InstrumentoPadrao" ADD COLUMN IF NOT EXISTS "fabricante" TEXT;
ALTER TABLE "InstrumentoPadrao" ADD COLUMN IF NOT EXISTS "modelo" TEXT;
ALTER TABLE "InstrumentoPadrao" ADD COLUMN IF NOT EXISTS "codigoPatrimonio" TEXT;
ALTER TABLE "InstrumentoPadrao" ADD COLUMN IF NOT EXISTS "grandezas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "InstrumentoPadrao" ADD COLUMN IF NOT EXISTS "faixaMedicao" TEXT;
ALTER TABLE "InstrumentoPadrao" ADD COLUMN IF NOT EXISTS "resolucao" TEXT;
ALTER TABLE "InstrumentoPadrao" ADD COLUMN IF NOT EXISTS "observacoes" TEXT;

CREATE INDEX IF NOT EXISTS "InstrumentoPadrao_estabelecimentoId_ativo_idx"
  ON "InstrumentoPadrao"("estabelecimentoId", "ativo");

CREATE TABLE IF NOT EXISTS "CertificadoPadrao" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "instrumentoId" TEXT NOT NULL,
  "numero" TEXT NOT NULL,
  "dataEmissao" TIMESTAMP(3) NOT NULL,
  "dataValidade" TIMESTAMP(3) NOT NULL,
  "laboratorioEmissor" TEXT,
  "laboratorioAcreditacao" TEXT,
  "fatorAbrangencia" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "observacoes" TEXT,
  "anexoNome" TEXT,
  "anexoMime" TEXT DEFAULT 'application/pdf',
  "anexoConteudo" BYTEA,
  "vigente" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificadoPadrao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CertificadoPadrao_instrumentoId_numero_key"
  ON "CertificadoPadrao"("instrumentoId", "numero");
CREATE INDEX IF NOT EXISTS "CertificadoPadrao_estabelecimentoId_idx"
  ON "CertificadoPadrao"("estabelecimentoId");
CREATE INDEX IF NOT EXISTS "CertificadoPadrao_instrumentoId_vigente_idx"
  ON "CertificadoPadrao"("instrumentoId", "vigente");
CREATE INDEX IF NOT EXISTS "CertificadoPadrao_dataValidade_idx"
  ON "CertificadoPadrao"("dataValidade");

CREATE TABLE IF NOT EXISTS "CertificadoPadraoPonto" (
  "id" TEXT NOT NULL,
  "certificadoId" TEXT NOT NULL,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "grandeza" TEXT,
  "unidade" TEXT NOT NULL,
  "valorNominal" DOUBLE PRECISION,
  "valorConvencional" DOUBLE PRECISION,
  "indicacao" DOUBLE PRECISION,
  "correcao" DOUBLE PRECISION,
  "incertezaExpandida" DOUBLE PRECISION NOT NULL,
  "fatorK" DOUBLE PRECISION DEFAULT 2,
  "observacao" TEXT,
  CONSTRAINT "CertificadoPadraoPonto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CertificadoPadraoPonto_certificadoId_idx"
  ON "CertificadoPadraoPonto"("certificadoId");

DO $$ BEGIN
  ALTER TABLE "CertificadoPadrao"
    ADD CONSTRAINT "CertificadoPadrao_instrumentoId_fkey"
    FOREIGN KEY ("instrumentoId") REFERENCES "InstrumentoPadrao"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CertificadoPadraoPonto"
    ADD CONSTRAINT "CertificadoPadraoPonto_certificadoId_fkey"
    FOREIGN KEY ("certificadoId") REFERENCES "CertificadoPadrao"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill: certificado vigente a partir do snapshot legado (sem pontos)
INSERT INTO "CertificadoPadrao" (
  "id", "estabelecimentoId", "instrumentoId", "numero",
  "dataEmissao", "dataValidade", "laboratorioEmissor",
  "fatorAbrangencia", "vigente", "createdAt", "updatedAt"
)
SELECT
  'cert_mig_' || i."id",
  i."estabelecimentoId",
  i."id",
  COALESCE(NULLIF(i."certificadoNumero", ''), 'LEGADO-' || i."nSerie"),
  COALESCE(i."certificadoEmissao", COALESCE(i."certificadoValidade", NOW())),
  COALESCE(i."certificadoValidade", NOW() + INTERVAL '365 days'),
  i."laboratorioEmissor",
  2,
  true,
  NOW(),
  NOW()
FROM "InstrumentoPadrao" i
WHERE i."certificadoValidade" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "CertificadoPadrao" c WHERE c."instrumentoId" = i."id"
  );
