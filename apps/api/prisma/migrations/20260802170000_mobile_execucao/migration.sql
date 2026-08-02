-- Mobile execução + idempotência persistida
CREATE TABLE IF NOT EXISTS "OsChecklistMobile" (
    "id" TEXT NOT NULL,
    "ordemServicoId" TEXT NOT NULL,
    "itens" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OsChecklistMobile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OsChecklistMobile_ordemServicoId_key" ON "OsChecklistMobile"("ordemServicoId");

CREATE TABLE IF NOT EXISTS "OsFotoMobile" (
    "id" TEXT NOT NULL,
    "ordemServicoId" TEXT NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "legenda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OsFotoMobile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OsFotoMobile_ordemServicoId_idx" ON "OsFotoMobile"("ordemServicoId");

CREATE TABLE IF NOT EXISTS "MobileSyncIdempotency" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MobileSyncIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MobileSyncIdempotency_estabelecimentoId_clientId_key" ON "MobileSyncIdempotency"("estabelecimentoId", "clientId");

DO $$ BEGIN
  ALTER TABLE "OsChecklistMobile" ADD CONSTRAINT "OsChecklistMobile_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "OsFotoMobile" ADD CONSTRAINT "OsFotoMobile_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "MobileSyncIdempotency" ADD CONSTRAINT "MobileSyncIdempotency_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
