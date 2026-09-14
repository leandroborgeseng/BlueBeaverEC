-- Inventário: cadastro completo, ciclo de vida, documentos e movimentações.
-- Aditivo: não apaga equipamentos, OS nem histórico HEF.

CREATE TYPE "PropriedadeEquipamento" AS ENUM ('PROPRIO', 'LOCADO', 'COMODATO');
CREATE TYPE "TipoMovimentacaoEquipamento" AS ENUM ('TRANSFERENCIA_SETOR', 'EMPRESTIMO', 'ASSISTENCIA', 'RETORNO');
CREATE TYPE "TipoDocumentoEquipamento" AS ENUM (
  'FOTO', 'MANUAL', 'GARANTIA', 'NOTA_FISCAL',
  'EVIDENCIA_RECEBIMENTO', 'EVIDENCIA_ENTRADA_OPERACAO', 'EVIDENCIA_DESATIVACAO', 'OUTRO'
);
CREATE TYPE "EventoCicloVida" AS ENUM ('RECEBIMENTO', 'ENTRADA_OPERACAO', 'DESATIVACAO');

ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "idInterna" TEXT;
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "unidade" TEXT;
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "localizacaoFisica" TEXT;
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "propriedade" "PropriedadeEquipamento" NOT NULL DEFAULT 'PROPRIO';
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "garantiaInicio" TIMESTAMP(3);
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "garantiaFim" TIMESTAMP(3);
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "criticidadeEquipamento" "Criticidade";
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "criticidadeJustificativa" TEXT;
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "criticidadeResponsavelId" TEXT;
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "qrToken" TEXT;
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "dataRecebimento" TIMESTAMP(3);
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "dataEntradaOperacao" TIMESTAMP(3);
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "dataDesativacao" TIMESTAMP(3);
ALTER TABLE "Equipamento" ADD COLUMN IF NOT EXISTS "motivoDesativacao" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Equipamento_qrToken_key" ON "Equipamento"("qrToken");
CREATE INDEX IF NOT EXISTS "Equipamento_estabelecimentoId_patrimonio_idx" ON "Equipamento"("estabelecimentoId", "patrimonio");
CREATE INDEX IF NOT EXISTS "Equipamento_estabelecimentoId_nSerie_idx" ON "Equipamento"("estabelecimentoId", "nSerie");
CREATE INDEX IF NOT EXISTS "Equipamento_estabelecimentoId_idInterna_idx" ON "Equipamento"("estabelecimentoId", "idInterna");

ALTER TABLE "Equipamento"
  ADD CONSTRAINT "Equipamento_criticidadeResponsavelId_fkey"
  FOREIGN KEY ("criticidadeResponsavelId") REFERENCES "Colaborador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EquipamentoMovimentacao" (
  "id" TEXT NOT NULL,
  "equipamentoId" TEXT NOT NULL,
  "tipo" "TipoMovimentacaoEquipamento" NOT NULL,
  "origemSetorId" TEXT,
  "destinoSetorId" TEXT,
  "origemLocalizacao" TEXT,
  "destinoLocalizacao" TEXT,
  "data" TIMESTAMP(3) NOT NULL,
  "responsavelNome" TEXT NOT NULL,
  "responsavelId" TEXT,
  "motivo" TEXT NOT NULL,
  "usuarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipamentoMovimentacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EquipamentoMovimentacao_equipamentoId_data_idx" ON "EquipamentoMovimentacao"("equipamentoId", "data");

ALTER TABLE "EquipamentoMovimentacao"
  ADD CONSTRAINT "EquipamentoMovimentacao_equipamentoId_fkey"
  FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipamentoMovimentacao"
  ADD CONSTRAINT "EquipamentoMovimentacao_origemSetorId_fkey"
  FOREIGN KEY ("origemSetorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipamentoMovimentacao"
  ADD CONSTRAINT "EquipamentoMovimentacao_destinoSetorId_fkey"
  FOREIGN KEY ("destinoSetorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipamentoMovimentacao"
  ADD CONSTRAINT "EquipamentoMovimentacao_responsavelId_fkey"
  FOREIGN KEY ("responsavelId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipamentoMovimentacao"
  ADD CONSTRAINT "EquipamentoMovimentacao_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EquipamentoDocumento" (
  "id" TEXT NOT NULL,
  "equipamentoId" TEXT NOT NULL,
  "tipo" "TipoDocumentoEquipamento" NOT NULL,
  "nomeArquivo" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "descricao" TEXT,
  "usuarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipamentoDocumento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EquipamentoDocumento_equipamentoId_idx" ON "EquipamentoDocumento"("equipamentoId");

ALTER TABLE "EquipamentoDocumento"
  ADD CONSTRAINT "EquipamentoDocumento_equipamentoId_fkey"
  FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipamentoDocumento"
  ADD CONSTRAINT "EquipamentoDocumento_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EquipamentoEventoCiclo" (
  "id" TEXT NOT NULL,
  "equipamentoId" TEXT NOT NULL,
  "tipo" "EventoCicloVida" NOT NULL,
  "data" TIMESTAMP(3) NOT NULL,
  "observacao" TEXT,
  "usuarioId" TEXT,
  "documentoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipamentoEventoCiclo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EquipamentoEventoCiclo_equipamentoId_data_idx" ON "EquipamentoEventoCiclo"("equipamentoId", "data");

ALTER TABLE "EquipamentoEventoCiclo"
  ADD CONSTRAINT "EquipamentoEventoCiclo_equipamentoId_fkey"
  FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipamentoEventoCiclo"
  ADD CONSTRAINT "EquipamentoEventoCiclo_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipamentoEventoCiclo"
  ADD CONSTRAINT "EquipamentoEventoCiclo_documentoId_fkey"
  FOREIGN KEY ("documentoId") REFERENCES "EquipamentoDocumento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
