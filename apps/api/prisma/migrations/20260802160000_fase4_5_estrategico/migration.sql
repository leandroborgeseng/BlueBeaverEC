-- AlterTable
ALTER TABLE "Estabelecimento" ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
ALTER TABLE "Estabelecimento" ADD COLUMN IF NOT EXISTS "fusoHorario" TEXT NOT NULL DEFAULT 'America/Sao_Paulo';
ALTER TABLE "Estabelecimento" ADD COLUMN IF NOT EXISTS "slaUrgenteHoras" INTEGER NOT NULL DEFAULT 4;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "EtapaJornada" AS ENUM ('DIAGNOSTICO', 'PRIORIZACAO', 'PLANO', 'IMPLANTACAO', 'EVIDENCIAS', 'AVALIACAO', 'MELHORIA_CONTINUA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusConformidade" AS ENUM ('CONFORME', 'PARCIAL', 'NAO_CONFORME', 'SEM_EVIDENCIA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FormulaIndicador" AS ENUM ('PERCENTUAL', 'CONTAGEM', 'MEDIA', 'SOMA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "StatusCapex" AS ENUM ('PROPOSTO', 'APROVADO', 'EXECUTADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "OrigemCapex" AS ENUM ('SUBSTITUICAO', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FrequenciaRelatorio" AS ENUM ('SEMANAL', 'MENSAL', 'TRIMESTRAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "NivelPermissaoModulo" AS ENUM ('NENHUM', 'LEITURA', 'EDICAO', 'EDICAO_APROVACAO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DominioMaturidade" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1,
    CONSTRAINT "DominioMaturidade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DominioMaturidade_codigo_key" ON "DominioMaturidade"("codigo");

CREATE TABLE IF NOT EXISTS "AvaliacaoMaturidade" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "dominioId" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "gaps" JSONB NOT NULL DEFAULT '[]',
    "evidencias" JSONB NOT NULL DEFAULT '[]',
    "planoAcao" TEXT,
    "avaliadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avaliadoPorId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvaliacaoMaturidade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AvaliacaoMaturidade_estabelecimentoId_dominioId_key" ON "AvaliacaoMaturidade"("estabelecimentoId", "dominioId");

CREATE TABLE IF NOT EXISTS "JornadaEvolucao" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "etapaAtual" "EtapaJornada" NOT NULL DEFAULT 'DIAGNOSTICO',
    "notas" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JornadaEvolucao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JornadaEvolucao_estabelecimentoId_key" ON "JornadaEvolucao"("estabelecimentoId");

CREATE TABLE IF NOT EXISTS "RequisitoNormativo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "norma" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "RequisitoNormativo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RequisitoNormativo_codigo_key" ON "RequisitoNormativo"("codigo");

CREATE TABLE IF NOT EXISTS "EvidenciaConformidade" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "requisitoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "arquivoUrl" TEXT,
    "status" "StatusConformidade" NOT NULL DEFAULT 'SEM_EVIDENCIA',
    "dataUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    CONSTRAINT "EvidenciaConformidade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EvidenciaConformidade_estabelecimentoId_requisitoId_idx" ON "EvidenciaConformidade"("estabelecimentoId", "requisitoId");

CREATE TABLE IF NOT EXISTS "Pop" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "versao" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'VIGENTE',
    "procedimentoLaudoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pop_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Pop_procedimentoLaudoId_key" ON "Pop"("procedimentoLaudoId");
CREATE UNIQUE INDEX IF NOT EXISTS "Pop_estabelecimentoId_codigo_key" ON "Pop"("estabelecimentoId", "codigo");

CREATE TABLE IF NOT EXISTS "RecomendacaoInstitucional" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "prioridade" TEXT NOT NULL DEFAULT 'MEDIA',
    "responsavelNome" TEXT,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecomendacaoInstitucional_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Indicador" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "metaTexto" TEXT,
    "metaNum" DOUBLE PRECISION,
    "formula" "FormulaIndicador" NOT NULL DEFAULT 'CONTAGEM',
    "campos" JSONB NOT NULL DEFAULT '[]',
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Indicador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Indicador_codigo_key" ON "Indicador"("codigo");

CREATE TABLE IF NOT EXISTS "IndicadorSnapshot" (
    "id" TEXT NOT NULL,
    "indicadorId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndicadorSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IndicadorSnapshot_indicadorId_periodo_key" ON "IndicadorSnapshot"("indicadorId", "periodo");

CREATE TABLE IF NOT EXISTS "PlanoDiretorItem" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "iniciativa" TEXT NOT NULL,
    "horizonteTexto" TEXT,
    "investimentoPrevisto" DECIMAL(14,2),
    "status" TEXT NOT NULL DEFAULT 'Em andamento',
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanoDiretorItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CapexItem" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorEstimado" DECIMAL(14,2) NOT NULL,
    "justificativa" TEXT NOT NULL,
    "status" "StatusCapex" NOT NULL DEFAULT 'PROPOSTO',
    "origem" "OrigemCapex" NOT NULL DEFAULT 'MANUAL',
    "equipamentoOrigemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CapexItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RelatorioAgendamento" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "frequencia" "FrequenciaRelatorio" NOT NULL DEFAULT 'MENSAL',
    "destinatarios" TEXT[],
    "proximoEnvio" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelatorioAgendamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PerfilCustom" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "permissoes" JSONB NOT NULL DEFAULT '{}',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PerfilCustom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PerfilCustom_estabelecimentoId_nome_key" ON "PerfilCustom"("estabelecimentoId", "nome");

-- ForeignKeys
DO $$ BEGIN
  ALTER TABLE "AvaliacaoMaturidade" ADD CONSTRAINT "AvaliacaoMaturidade_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "AvaliacaoMaturidade" ADD CONSTRAINT "AvaliacaoMaturidade_dominioId_fkey" FOREIGN KEY ("dominioId") REFERENCES "DominioMaturidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "JornadaEvolucao" ADD CONSTRAINT "JornadaEvolucao_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EvidenciaConformidade" ADD CONSTRAINT "EvidenciaConformidade_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "EvidenciaConformidade" ADD CONSTRAINT "EvidenciaConformidade_requisitoId_fkey" FOREIGN KEY ("requisitoId") REFERENCES "RequisitoNormativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Pop" ADD CONSTRAINT "Pop_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Pop" ADD CONSTRAINT "Pop_procedimentoLaudoId_fkey" FOREIGN KEY ("procedimentoLaudoId") REFERENCES "ProcedimentoLaudo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "RecomendacaoInstitucional" ADD CONSTRAINT "RecomendacaoInstitucional_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "Indicador" ADD CONSTRAINT "Indicador_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "IndicadorSnapshot" ADD CONSTRAINT "IndicadorSnapshot_indicadorId_fkey" FOREIGN KEY ("indicadorId") REFERENCES "Indicador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PlanoDiretorItem" ADD CONSTRAINT "PlanoDiretorItem_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "CapexItem" ADD CONSTRAINT "CapexItem_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "RelatorioAgendamento" ADD CONSTRAINT "RelatorioAgendamento_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "PerfilCustom" ADD CONSTRAINT "PerfilCustom_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
