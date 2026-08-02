CREATE TYPE "TipoLaudo" AS ENUM ('RECEBIMENTO', 'PREVENTIVA', 'CALIBRACAO', 'TSE');
CREATE TYPE "ResultadoLaudo" AS ENUM ('APROVADO', 'REPROVADO', 'APROVADO_COM_RESSALVAS');
CREATE TYPE "NormaTse" AS ENUM ('FABRICA', 'EC');
CREATE TYPE "StatusCertificado" AS ENUM ('VALIDO', 'A_VENCER', 'VENCIDO');

CREATE TABLE "ProcedimentoLaudo" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoLaudo" NOT NULL,
    "validadeMeses" INTEGER NOT NULL DEFAULT 12,
    "itens" JSONB NOT NULL DEFAULT '[]',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcedimentoLaudo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProcedimentoLaudo_estabelecimentoId_tipo_idx" ON "ProcedimentoLaudo"("estabelecimentoId", "tipo");

CREATE TABLE "ProcedimentoModelo" (
    "id" TEXT NOT NULL,
    "procedimentoId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    CONSTRAINT "ProcedimentoModelo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcedimentoModelo_procedimentoId_modeloId_key" ON "ProcedimentoModelo"("procedimentoId", "modeloId");
CREATE INDEX "ProcedimentoModelo_modeloId_idx" ON "ProcedimentoModelo"("modeloId");

CREATE TABLE "InstrumentoPadrao" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nSerie" TEXT NOT NULL,
    "certificadoNumero" TEXT,
    "certificadoEmissao" TIMESTAMP(3),
    "certificadoValidade" TIMESTAMP(3),
    "laboratorioEmissor" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstrumentoPadrao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstrumentoPadrao_estabelecimentoId_nSerie_key" ON "InstrumentoPadrao"("estabelecimentoId", "nSerie");

CREATE TABLE "Laudo" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "tipo" "TipoLaudo" NOT NULL,
    "numero" TEXT NOT NULL,
    "equipamentoId" TEXT NOT NULL,
    "osNumero" INTEGER,
    "dataExecucao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tecnicoNome" TEXT,
    "responsavelTecnicoId" TEXT,
    "procedimentoId" TEXT,
    "instrumentoId" TEXT,
    "resultado" "ResultadoLaudo",
    "justificativaRessalva" TEXT,
    "validadeMeses" INTEGER,
    "validadeAte" TIMESTAMP(3),
    "respostas" JSONB NOT NULL DEFAULT '[]',
    "metadados" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Laudo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Laudo_estabelecimentoId_numero_key" ON "Laudo"("estabelecimentoId", "numero");
CREATE INDEX "Laudo_estabelecimentoId_tipo_idx" ON "Laudo"("estabelecimentoId", "tipo");
CREATE INDEX "Laudo_equipamentoId_idx" ON "Laudo"("equipamentoId");

ALTER TABLE "ProcedimentoLaudo" ADD CONSTRAINT "ProcedimentoLaudo_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcedimentoModelo" ADD CONSTRAINT "ProcedimentoModelo_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "ProcedimentoLaudo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProcedimentoModelo" ADD CONSTRAINT "ProcedimentoModelo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstrumentoPadrao" ADD CONSTRAINT "InstrumentoPadrao_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Laudo" ADD CONSTRAINT "Laudo_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Laudo" ADD CONSTRAINT "Laudo_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Laudo" ADD CONSTRAINT "Laudo_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "ProcedimentoLaudo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Laudo" ADD CONSTRAINT "Laudo_instrumentoId_fkey" FOREIGN KEY ("instrumentoId") REFERENCES "InstrumentoPadrao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Laudo" ADD CONSTRAINT "Laudo_responsavelTecnicoId_fkey" FOREIGN KEY ("responsavelTecnicoId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
