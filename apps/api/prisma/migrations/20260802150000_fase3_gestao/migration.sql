ALTER TABLE "OrdemServico" ADD COLUMN "contratoId" TEXT;

CREATE TYPE "SituacaoContrato" AS ENUM ('VIGENTE', 'A_VENCER', 'VENCIDO');
CREATE TYPE "IndiceReajuste" AS ENUM ('IPCA', 'IGP_M');
CREATE TYPE "SituacaoComponenteRecuperado" AS ENUM ('EM_RASTREAMENTO', 'REAPROVEITADO', 'DESCARTADO');
CREATE TYPE "StatusAuditoria" AS ENUM ('PLANEJADA', 'EM_EXECUCAO', 'CONCLUIDA');
CREATE TYPE "StatusNC" AS ENUM ('ABERTA', 'EM_ACAO', 'FECHADA');

CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "situacao" "SituacaoContrato" NOT NULL DEFAULT 'VIGENTE',
    "vigenciaInicio" TIMESTAMP(3) NOT NULL,
    "vigenciaFim" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "slaAtendimentoHoras" INTEGER,
    "slaSolucaoHoras" INTEGER,
    "indiceReajuste" "IndiceReajuste",
    "dataReajusteAniversario" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Contrato_estabelecimentoId_numero_key" ON "Contrato"("estabelecimentoId", "numero");
CREATE INDEX "Contrato_estabelecimentoId_situacao_idx" ON "Contrato"("estabelecimentoId", "situacao");

CREATE TABLE "ContratoEquipamento" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "equipamentoId" TEXT NOT NULL,
    CONSTRAINT "ContratoEquipamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContratoEquipamento_contratoId_equipamentoId_key" ON "ContratoEquipamento"("contratoId", "equipamentoId");

CREATE TABLE "ContratoGlosa" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valor" DECIMAL(14,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    CONSTRAINT "ContratoGlosa_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "turno" TEXT,
    "liderId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Equipe_estabelecimentoId_nome_key" ON "Equipe"("estabelecimentoId", "nome");

CREATE TABLE "EquipeMembro" (
    "id" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    CONSTRAINT "EquipeMembro_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EquipeMembro_equipeId_colaboradorId_key" ON "EquipeMembro"("equipeId", "colaboradorId");

CREATE TABLE "Competencia" (
    "id" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nivel" TEXT,
    "validade" TIMESTAMP(3),
    CONSTRAINT "Competencia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComponenteRecuperado" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "itemDescricao" TEXT NOT NULL,
    "equipamentoOrigemId" TEXT NOT NULL,
    "dataRetirada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "situacao" "SituacaoComponenteRecuperado" NOT NULL DEFAULT 'EM_RASTREAMENTO',
    "equipamentoDestinoId" TEXT,
    "osDestinoNumero" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComponenteRecuperado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "responsavelId" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "StatusAuditoria" NOT NULL DEFAULT 'PLANEJADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NaoConformidade" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "status" "StatusNC" NOT NULL DEFAULT 'ABERTA',
    "auditoriaId" TEXT,
    "ordemServicoId" TEXT,
    "justificativaFechamento" TEXT,
    "justificativaReabertura" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NaoConformidade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NaoConformidade_estabelecimentoId_codigo_key" ON "NaoConformidade"("estabelecimentoId", "codigo");

CREATE TABLE "PlanoAcao" (
    "id" TEXT NOT NULL,
    "naoConformidadeId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "responsavelNome" TEXT,
    "prazo" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "escalonadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanoAcao_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContratoEquipamento" ADD CONSTRAINT "ContratoEquipamento_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoEquipamento" ADD CONSTRAINT "ContratoEquipamento_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContratoGlosa" ADD CONSTRAINT "ContratoGlosa_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Competencia" ADD CONSTRAINT "Competencia_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponenteRecuperado" ADD CONSTRAINT "ComponenteRecuperado_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComponenteRecuperado" ADD CONSTRAINT "ComponenteRecuperado_equipamentoOrigemId_fkey" FOREIGN KEY ("equipamentoOrigemId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComponenteRecuperado" ADD CONSTRAINT "ComponenteRecuperado_equipamentoDestinoId_fkey" FOREIGN KEY ("equipamentoDestinoId") REFERENCES "Equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NaoConformidade" ADD CONSTRAINT "NaoConformidade_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NaoConformidade" ADD CONSTRAINT "NaoConformidade_auditoriaId_fkey" FOREIGN KEY ("auditoriaId") REFERENCES "Auditoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NaoConformidade" ADD CONSTRAINT "NaoConformidade_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanoAcao" ADD CONSTRAINT "PlanoAcao_naoConformidadeId_fkey" FOREIGN KEY ("naoConformidadeId") REFERENCES "NaoConformidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
