-- Equipamento: data de instalação (import real)
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "dataInstalacao" TIMESTAMP(3);
