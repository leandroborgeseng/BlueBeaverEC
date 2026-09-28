-- Backup das localizações (tabela "Setor") antes de adicionar o agrupamento.
-- IDs e nomes das localizações não são alterados. Equipamento.setorId permanece.

CREATE TABLE IF NOT EXISTS "_backup_setor_20260928" AS TABLE "Setor";

CREATE TABLE IF NOT EXISTS "SetorArea" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SetorArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SetorArea_estabelecimentoId_nome_key"
  ON "SetorArea"("estabelecimentoId", "nome");

CREATE INDEX IF NOT EXISTS "SetorArea_estabelecimentoId_idx"
  ON "SetorArea"("estabelecimentoId");

ALTER TABLE "SetorArea" DROP CONSTRAINT IF EXISTS "SetorArea_estabelecimentoId_fkey";
ALTER TABLE "SetorArea"
  ADD CONSTRAINT "SetorArea_estabelecimentoId_fkey"
  FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Setor" ADD COLUMN IF NOT EXISTS "setorAreaId" TEXT;

CREATE INDEX IF NOT EXISTS "Setor_setorAreaId_idx" ON "Setor"("setorAreaId");

ALTER TABLE "Setor" DROP CONSTRAINT IF EXISTS "Setor_setorAreaId_fkey";
ALTER TABLE "Setor"
  ADD CONSTRAINT "Setor_setorAreaId_fkey"
  FOREIGN KEY ("setorAreaId") REFERENCES "SetorArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cria setores só onde já existem as localizações do mapeamento (idempotente).
INSERT INTO "SetorArea" ("id", "estabelecimentoId", "nome", "ativo", "createdAt", "updatedAt")
SELECT
  md5('setor-area:' || s."estabelecimentoId" || ':' || m.setor),
  s."estabelecimentoId",
  m.setor,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('3º Andar - Q301', 'Internação - 3º Andar'),
    ('3º Andar - Q302', 'Internação - 3º Andar'),
    ('3º Andar - Q304', 'Internação - 3º Andar'),
    ('3º Andar - Q309', 'Internação - 3º Andar'),
    ('3º Andar - Q312', 'Internação - 3º Andar'),
    ('3º Andar - Q313', 'Internação - 3º Andar'),
    ('3º Andar - Q314', 'Internação - 3º Andar'),
    ('3º Andar - Q315', 'Internação - 3º Andar'),
    ('Isolamento 3º Andar', 'Internação - 3º Andar'),
    ('Sala Equipamentos 3º Andar', 'Internação - 3º Andar'),
    ('Q401', 'Internação - 4º Andar'),
    ('Q402', 'Internação - 4º Andar'),
    ('Q403', 'Internação - 4º Andar'),
    ('Q409', 'Internação - 4º Andar'),
    ('Q410', 'Internação - 4º Andar'),
    ('Q411', 'Internação - 4º Andar'),
    ('Q412', 'Internação - 4º Andar'),
    ('Q413', 'Internação - 4º Andar'),
    ('Q414', 'Internação - 4º Andar'),
    ('Q415', 'Internação - 4º Andar'),
    ('Sala Equipamentos 4º Andar', 'Internação - 4º Andar'),
    ('Ambulatório', 'Ambulatório'),
    ('Audiometria', 'Ambulatório'),
    ('Eletrocardio', 'Ambulatório'),
    ('Eletroneuro', 'Ambulatório'),
    ('Ergonometrico', 'Ambulatório'),
    ('Ultrassom 01', 'Ambulatório'),
    ('Ultrassom 02', 'Ambulatório'),
    ('Centro Cirurgico Ambulatorial Sala 01', 'Centro Cirúrgico Ambulatorial'),
    ('Centro Cirurgico Ambulatorial Sala 02', 'Centro Cirúrgico Ambulatorial'),
    ('Centro Cirurgico Ambulatorial Sala 03', 'Centro Cirúrgico Ambulatorial'),
    ('Sala R.P.A. CCA', 'Centro Cirúrgico Ambulatorial'),
    ('Centro Cirurgico Sala 1', 'Centro Cirúrgico'),
    ('Centro Cirurgico Sala 2', 'Centro Cirúrgico'),
    ('Centro Cirurgico Sala 3', 'Centro Cirúrgico'),
    ('Centro Cirurgico Sala 4', 'Centro Cirúrgico'),
    ('Centro Cirurgico Sala 5', 'Centro Cirúrgico'),
    ('Centro Cirurgico Sala 6', 'Centro Cirúrgico'),
    ('C.M.E.', 'CME'),
    ('Colonoscopia', 'Endoscopia'),
    ('Endoscopia', 'Endoscopia'),
    ('Depósito Equipamentos Eng. Clin.', 'Engenharia Clínica'),
    ('Emergencia Adulto', 'Emergência Adulto'),
    ('P.A. Adulto', 'Emergência Adulto'),
    ('Isolamento Adulto', 'Emergência Adulto'),
    ('Emergencia Infantil', 'Emergência Infantil'),
    ('P.A. Infantil', 'Emergência Infantil'),
    ('Isolamento Infantil', 'Emergência Infantil'),
    ('Farmácia', 'Farmácia'),
    ('Hospital Dia', 'Hospital Dia'),
    ('Sala Equipamentos (Hosp. Dia)', 'Hospital Dia'),
    ('Laboratório', 'Laboratório'),
    ('Nutrição', 'Nutrição'),
    ('Preparo/Recuperação Raio X', 'Diagnóstico por Imagem'),
    ('Raio X Sala 01', 'Diagnóstico por Imagem'),
    ('Raio X Sala 02', 'Diagnóstico por Imagem'),
    ('Tomografia', 'Diagnóstico por Imagem'),
    ('Sala Hemodinâmica', 'Hemodinâmica'),
    ('Sala Procedimentos Térreo', 'Térreo'),
    ('Térreo', 'Térreo'),
    ('U.T.I.', 'UTI'),
    ('U.T.I. - Expurgo', 'UTI'),
    ('U.T.I. - Isolamento', 'UTI'),
    ('Sala Equipamentos UTI', 'UTI')
) AS m(localizacao, setor)
JOIN "Setor" s ON s.nome = m.localizacao
ON CONFLICT ("estabelecimentoId", nome) DO NOTHING;

UPDATE "Setor" s
SET "setorAreaId" = a.id
FROM "SetorArea" a,
     (
       VALUES
         ('3º Andar - Q301', 'Internação - 3º Andar'),
         ('3º Andar - Q302', 'Internação - 3º Andar'),
         ('3º Andar - Q304', 'Internação - 3º Andar'),
         ('3º Andar - Q309', 'Internação - 3º Andar'),
         ('3º Andar - Q312', 'Internação - 3º Andar'),
         ('3º Andar - Q313', 'Internação - 3º Andar'),
         ('3º Andar - Q314', 'Internação - 3º Andar'),
         ('3º Andar - Q315', 'Internação - 3º Andar'),
         ('Isolamento 3º Andar', 'Internação - 3º Andar'),
         ('Sala Equipamentos 3º Andar', 'Internação - 3º Andar'),
         ('Q401', 'Internação - 4º Andar'),
         ('Q402', 'Internação - 4º Andar'),
         ('Q403', 'Internação - 4º Andar'),
         ('Q409', 'Internação - 4º Andar'),
         ('Q410', 'Internação - 4º Andar'),
         ('Q411', 'Internação - 4º Andar'),
         ('Q412', 'Internação - 4º Andar'),
         ('Q413', 'Internação - 4º Andar'),
         ('Q414', 'Internação - 4º Andar'),
         ('Q415', 'Internação - 4º Andar'),
         ('Sala Equipamentos 4º Andar', 'Internação - 4º Andar'),
         ('Ambulatório', 'Ambulatório'),
         ('Audiometria', 'Ambulatório'),
         ('Eletrocardio', 'Ambulatório'),
         ('Eletroneuro', 'Ambulatório'),
         ('Ergonometrico', 'Ambulatório'),
         ('Ultrassom 01', 'Ambulatório'),
         ('Ultrassom 02', 'Ambulatório'),
         ('Centro Cirurgico Ambulatorial Sala 01', 'Centro Cirúrgico Ambulatorial'),
         ('Centro Cirurgico Ambulatorial Sala 02', 'Centro Cirúrgico Ambulatorial'),
         ('Centro Cirurgico Ambulatorial Sala 03', 'Centro Cirúrgico Ambulatorial'),
         ('Sala R.P.A. CCA', 'Centro Cirúrgico Ambulatorial'),
         ('Centro Cirurgico Sala 1', 'Centro Cirúrgico'),
         ('Centro Cirurgico Sala 2', 'Centro Cirúrgico'),
         ('Centro Cirurgico Sala 3', 'Centro Cirúrgico'),
         ('Centro Cirurgico Sala 4', 'Centro Cirúrgico'),
         ('Centro Cirurgico Sala 5', 'Centro Cirúrgico'),
         ('Centro Cirurgico Sala 6', 'Centro Cirúrgico'),
         ('C.M.E.', 'CME'),
         ('Colonoscopia', 'Endoscopia'),
         ('Endoscopia', 'Endoscopia'),
         ('Depósito Equipamentos Eng. Clin.', 'Engenharia Clínica'),
         ('Emergencia Adulto', 'Emergência Adulto'),
         ('P.A. Adulto', 'Emergência Adulto'),
         ('Isolamento Adulto', 'Emergência Adulto'),
         ('Emergencia Infantil', 'Emergência Infantil'),
         ('P.A. Infantil', 'Emergência Infantil'),
         ('Isolamento Infantil', 'Emergência Infantil'),
         ('Farmácia', 'Farmácia'),
         ('Hospital Dia', 'Hospital Dia'),
         ('Sala Equipamentos (Hosp. Dia)', 'Hospital Dia'),
         ('Laboratório', 'Laboratório'),
         ('Nutrição', 'Nutrição'),
         ('Preparo/Recuperação Raio X', 'Diagnóstico por Imagem'),
         ('Raio X Sala 01', 'Diagnóstico por Imagem'),
         ('Raio X Sala 02', 'Diagnóstico por Imagem'),
         ('Tomografia', 'Diagnóstico por Imagem'),
         ('Sala Hemodinâmica', 'Hemodinâmica'),
         ('Sala Procedimentos Térreo', 'Térreo'),
         ('Térreo', 'Térreo'),
         ('U.T.I.', 'UTI'),
         ('U.T.I. - Expurgo', 'UTI'),
         ('U.T.I. - Isolamento', 'UTI'),
         ('Sala Equipamentos UTI', 'UTI')
     ) AS m(localizacao, setor)
WHERE a."estabelecimentoId" = s."estabelecimentoId"
  AND a.nome = m.setor
  AND s.nome = m.localizacao;
