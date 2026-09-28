-- Sigla do setor funcional para TAG HEF-{sigla}-{seq}. Não altera TAG existente.

ALTER TABLE "SetorArea" ADD COLUMN IF NOT EXISTS "sigla" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SetorArea_estabelecimentoId_sigla_key"
  ON "SetorArea"("estabelecimentoId", "sigla");

UPDATE "SetorArea" SET sigla = 'I3A', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Internação - 3º Andar' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'I4A', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Internação - 4º Andar' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'AMB', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Ambulatório' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'CCA', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Centro Cirúrgico Ambulatorial' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'CCI', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Centro Cirúrgico' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'CME', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'CME' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'END', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Endoscopia' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'ECL', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Engenharia Clínica' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'EAD', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Emergência Adulto' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'EIN', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Emergência Infantil' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'FAR', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Farmácia' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'HDI', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Hospital Dia' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'LAB', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Laboratório' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'NUT', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Nutrição' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'DIM', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Diagnóstico por Imagem' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'HEM', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Hemodinâmica' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'TER', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'Térreo' AND sigla IS NULL;
UPDATE "SetorArea" SET sigla = 'UTI', "updatedAt" = CURRENT_TIMESTAMP WHERE nome = 'UTI' AND sigla IS NULL;
