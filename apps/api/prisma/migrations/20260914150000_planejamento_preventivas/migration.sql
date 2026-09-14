-- Planejamento de preventiva, calibração, TSE, qualificação e outros.
-- Aditivo: não apaga equipamentos, OS, laudos nem inventário HEF.

DO $$ BEGIN
  CREATE TYPE "TipoAtividadePlano" AS ENUM ('PREVENTIVA', 'CALIBRACAO', 'TSE', 'QUALIFICACAO', 'OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FontePeriodicidade" AS ENUM ('FABRICANTE', 'PROCEDIMENTO', 'OUTRA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ModoAgendamentoPlano" AS ENUM ('CALENDARIO_FIXO', 'INTERVALO_EXECUCAO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ExecutorPlano" AS ENUM ('INTERNO', 'EXTERNO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusPlanoInstancia" AS ENUM ('ATIVO', 'SUSPENSO', 'DESATIVADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusOcorrenciaPlano" AS ENUM ('PREVISTA', 'A_VENCER', 'VENCIDA', 'OS_GERADA', 'EXECUTADA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusGeracaoOsPlano" AS ENUM ('PENDENTE', 'OK', 'FALHA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PlanoTipoCustom" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanoTipoCustom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanoTipoCustom_estabelecimentoId_nome_key"
  ON "PlanoTipoCustom"("estabelecimentoId", "nome");

CREATE TABLE IF NOT EXISTS "PlanoGrupo" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanoGrupo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanoGrupo_estabelecimentoId_nome_key"
  ON "PlanoGrupo"("estabelecimentoId", "nome");

CREATE TABLE IF NOT EXISTS "PlanoInstancia" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "equipamentoId" TEXT NOT NULL,
  "modeloOrigemId" TEXT,
  "grupoId" TEXT,
  "tipo" "TipoAtividadePlano" NOT NULL,
  "tipoCustomId" TEXT,
  "chaveUnica" TEXT NOT NULL,
  "planoTesteId" TEXT,
  "procedimentoCodigo" TEXT,
  "periodicidadeMeses" INTEGER,
  "fontePeriodicidade" "FontePeriodicidade",
  "fontePeriodicidadeObs" TEXT,
  "modoAgendamento" "ModoAgendamentoPlano" NOT NULL DEFAULT 'INTERVALO_EXECUCAO',
  "diaFixo" INTEGER,
  "mesFixo" INTEGER,
  "antecedenciaDias" INTEGER NOT NULL DEFAULT 15,
  "proximaData" TIMESTAMP(3),
  "dataPrevistaOriginal" TIMESTAMP(3),
  "responsavelId" TEXT,
  "executorTipo" "ExecutorPlano" NOT NULL DEFAULT 'INTERNO',
  "fornecedorId" TEXT,
  "status" "StatusPlanoInstancia" NOT NULL DEFAULT 'ATIVO',
  "motivoSuspensao" TEXT,
  "suspensoEm" TIMESTAMP(3),
  "suspensoPorId" TEXT,
  "origemCatalogo" BOOLEAN NOT NULL DEFAULT false,
  "editadoManualmente" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanoInstancia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanoInstancia_equipamentoId_chaveUnica_key"
  ON "PlanoInstancia"("equipamentoId", "chaveUnica");
CREATE INDEX IF NOT EXISTS "PlanoInstancia_estabelecimentoId_status_idx"
  ON "PlanoInstancia"("estabelecimentoId", "status");
CREATE INDEX IF NOT EXISTS "PlanoInstancia_estabelecimentoId_tipo_idx"
  ON "PlanoInstancia"("estabelecimentoId", "tipo");
CREATE INDEX IF NOT EXISTS "PlanoInstancia_modeloOrigemId_idx" ON "PlanoInstancia"("modeloOrigemId");
CREATE INDEX IF NOT EXISTS "PlanoInstancia_proximaData_idx" ON "PlanoInstancia"("proximaData");

CREATE TABLE IF NOT EXISTS "PlanoOcorrencia" (
  "id" TEXT NOT NULL,
  "planoInstanciaId" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "dataPrevista" TIMESTAMP(3) NOT NULL,
  "dataPrevistaOriginal" TIMESTAMP(3) NOT NULL,
  "atrasoDias" INTEGER NOT NULL DEFAULT 0,
  "status" "StatusOcorrenciaPlano" NOT NULL DEFAULT 'PREVISTA',
  "cumpriuPlano" BOOLEAN NOT NULL DEFAULT false,
  "osId" TEXT,
  "osGeracaoStatus" "StatusGeracaoOsPlano" NOT NULL DEFAULT 'PENDENTE',
  "osGeracaoErro" TEXT,
  "osGeracaoTentativas" INTEGER NOT NULL DEFAULT 0,
  "reprogramadaEm" TIMESTAMP(3),
  "reprogramadaPorId" TEXT,
  "motivoReprogramacao" TEXT,
  "executadaEm" TIMESTAMP(3),
  "executorNome" TEXT,
  "executorId" TEXT,
  "fornecedorExecId" TEXT,
  "resultado" "ResultadoLaudo",
  "laudoId" TEXT,
  "checklist" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanoOcorrencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlanoOcorrencia_osId_key" ON "PlanoOcorrencia"("osId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanoOcorrencia_planoInstanciaId_dataPrevistaOriginal_key"
  ON "PlanoOcorrencia"("planoInstanciaId", "dataPrevistaOriginal");
CREATE INDEX IF NOT EXISTS "PlanoOcorrencia_estabelecimentoId_status_dataPrevista_idx"
  ON "PlanoOcorrencia"("estabelecimentoId", "status", "dataPrevista");
CREATE INDEX IF NOT EXISTS "PlanoOcorrencia_dataPrevista_idx" ON "PlanoOcorrencia"("dataPrevista");

CREATE TABLE IF NOT EXISTS "PlanoHistorico" (
  "id" TEXT NOT NULL,
  "planoInstanciaId" TEXT NOT NULL,
  "usuarioId" TEXT,
  "acao" TEXT NOT NULL,
  "detalhe" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanoHistorico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlanoHistorico_planoInstanciaId_createdAt_idx"
  ON "PlanoHistorico"("planoInstanciaId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PlanoTipoCustom" ADD CONSTRAINT "PlanoTipoCustom_estabelecimentoId_fkey"
    FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlanoGrupo" ADD CONSTRAINT "PlanoGrupo_estabelecimentoId_fkey"
    FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_estabelecimentoId_fkey"
    FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_equipamentoId_fkey"
    FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_modeloOrigemId_fkey"
    FOREIGN KEY ("modeloOrigemId") REFERENCES "Modelo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_grupoId_fkey"
    FOREIGN KEY ("grupoId") REFERENCES "PlanoGrupo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_tipoCustomId_fkey"
    FOREIGN KEY ("tipoCustomId") REFERENCES "PlanoTipoCustom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_planoTesteId_fkey"
    FOREIGN KEY ("planoTesteId") REFERENCES "PlanoTeste"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_responsavelId_fkey"
    FOREIGN KEY ("responsavelId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_fornecedorId_fkey"
    FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlanoOcorrencia" ADD CONSTRAINT "PlanoOcorrencia_planoInstanciaId_fkey"
    FOREIGN KEY ("planoInstanciaId") REFERENCES "PlanoInstancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoOcorrencia" ADD CONSTRAINT "PlanoOcorrencia_estabelecimentoId_fkey"
    FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoOcorrencia" ADD CONSTRAINT "PlanoOcorrencia_osId_fkey"
    FOREIGN KEY ("osId") REFERENCES "OrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoOcorrencia" ADD CONSTRAINT "PlanoOcorrencia_executorId_fkey"
    FOREIGN KEY ("executorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoOcorrencia" ADD CONSTRAINT "PlanoOcorrencia_fornecedorExecId_fkey"
    FOREIGN KEY ("fornecedorExecId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoOcorrencia" ADD CONSTRAINT "PlanoOcorrencia_laudoId_fkey"
    FOREIGN KEY ("laudoId") REFERENCES "Laudo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PlanoHistorico" ADD CONSTRAINT "PlanoHistorico_planoInstanciaId_fkey"
    FOREIGN KEY ("planoInstanciaId") REFERENCES "PlanoInstancia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
