-- Classificação de propriedade configurável além de próprio/locado/comodato.
ALTER TYPE "PropriedadeEquipamento" ADD VALUE IF NOT EXISTS 'OUTRO';
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "propriedadeOutra" TEXT;
