-- Fornecedores (contatos/docs), contratos de manutenção (escopo/cobertura) e atendimento externo.
-- Aditivo: não apaga equipamentos, OS, contratos vigentes nem inventário HEF.
-- Garantia de aquisição permanece no equipamento; não vira contrato.

ALTER TABLE "Fornecedor"
  ADD COLUMN IF NOT EXISTS "telefone" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "endereco" TEXT,
  ADD COLUMN IF NOT EXISTS "especialidades" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "observacoes" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "FornecedorContato" (
  "id" TEXT NOT NULL,
  "fornecedorId" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "cargo" TEXT,
  "telefone" TEXT,
  "email" TEXT,
  "principal" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "FornecedorContato_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FornecedorContato_fornecedorId_idx" ON "FornecedorContato"("fornecedorId");

CREATE TABLE IF NOT EXISTS "FornecedorDocumento" (
  "id" TEXT NOT NULL,
  "fornecedorId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'OUTRO',
  "nomeArquivo" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "descricao" TEXT,
  "usuarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FornecedorDocumento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FornecedorDocumento_fornecedorId_idx" ON "FornecedorDocumento"("fornecedorId");

CREATE TABLE IF NOT EXISTS "FornecedorNota" (
  "id" TEXT NOT NULL,
  "fornecedorId" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "usuarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FornecedorNota_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FornecedorNota_fornecedorId_createdAt_idx" ON "FornecedorNota"("fornecedorId", "createdAt");

CREATE TABLE IF NOT EXISTS "FornecedorFabricante" (
  "id" TEXT NOT NULL,
  "fornecedorId" TEXT NOT NULL,
  "fabricanteId" TEXT NOT NULL,
  CONSTRAINT "FornecedorFabricante_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FornecedorFabricante_fornecedorId_fabricanteId_key"
  ON "FornecedorFabricante"("fornecedorId", "fabricanteId");

DO $$ BEGIN
  CREATE TYPE "TipoContrato" AS ENUM ('MANUTENCAO', 'OUTRO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PeriodicidadeContrato" AS ENUM ('UNICA', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Contrato"
  ADD COLUMN IF NOT EXISTS "tipo" "TipoContrato" NOT NULL DEFAULT 'MANUTENCAO',
  ADD COLUMN IF NOT EXISTS "periodicidade" "PeriodicidadeContrato",
  ADD COLUMN IF NOT EXISTS "escopo" TEXT,
  ADD COLUMN IF NOT EXISTS "exclusoes" TEXT,
  ADD COLUMN IF NOT EXISTS "cobrePecas" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cobreServicos" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "diasAlertaVencimento" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "observacoes" TEXT;

ALTER TABLE "Contrato" ALTER COLUMN "valor" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "ContratoDocumento" (
  "id" TEXT NOT NULL,
  "contratoId" TEXT NOT NULL,
  "nomeArquivo" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "descricao" TEXT,
  "usuarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContratoDocumento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ContratoDocumento_contratoId_idx" ON "ContratoDocumento"("contratoId");

DO $$ BEGIN
  CREATE TYPE "StatusAtendimentoExterno" AS ENUM (
    'ORCAMENTO', 'ORCAMENTO_RECEBIDO', 'DECISAO', 'ENVIADO',
    'AGUARDANDO_RETORNO', 'RETORNADO', 'CONFERENCIA', 'LIBERADO', 'CANCELADO'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DecisaoOrcamento" AS ENUM ('PENDENTE', 'APROVADO', 'REPROVADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ModoDecisaoOrcamento" AS ENUM ('APROVACAO_INTERNA', 'AUTORIZACAO_EXTERNA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AtendimentoExterno" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "ordemServicoId" TEXT NOT NULL,
  "equipamentoId" TEXT NOT NULL,
  "fornecedorId" TEXT NOT NULL,
  "contratoId" TEXT,
  "status" "StatusAtendimentoExterno" NOT NULL DEFAULT 'ORCAMENTO',
  "transporte" TEXT,
  "identificacaoEquipamento" TEXT,
  "acessorios" TEXT,
  "origemSetorId" TEXT,
  "origemLocalizacao" TEXT,
  "enviadoEm" TIMESTAMP(3),
  "previsaoRetorno" TIMESTAMP(3),
  "retornadoEm" TIMESTAMP(3),
  "foraDoHospital" BOOLEAN NOT NULL DEFAULT false,
  "pendenciaRetorno" BOOLEAN NOT NULL DEFAULT false,
  "conferenciaEm" TIMESTAMP(3),
  "conferenciaPorId" TEXT,
  "conferenciaColabId" TEXT,
  "conferenciaOk" BOOLEAN,
  "conferenciaObs" TEXT,
  "condicaoFinal" "CondicaoUsoEquipamento",
  "custoInformado" DECIMAL(14,2),
  "custoAprovado" DECIMAL(14,2),
  "custoRealizado" DECIMAL(14,2),
  "custoOsItemId" TEXT,
  "observacoes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtendimentoExterno_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AtendimentoExterno_estabelecimentoId_status_idx"
  ON "AtendimentoExterno"("estabelecimentoId", "status");
CREATE INDEX IF NOT EXISTS "AtendimentoExterno_ordemServicoId_idx" ON "AtendimentoExterno"("ordemServicoId");
CREATE INDEX IF NOT EXISTS "AtendimentoExterno_equipamentoId_idx" ON "AtendimentoExterno"("equipamentoId");
CREATE INDEX IF NOT EXISTS "AtendimentoExterno_fornecedorId_idx" ON "AtendimentoExterno"("fornecedorId");

CREATE TABLE IF NOT EXISTS "AtendimentoOrcamento" (
  "id" TEXT NOT NULL,
  "atendimentoId" TEXT NOT NULL,
  "versao" INTEGER NOT NULL,
  "valor" DECIMAL(14,2) NOT NULL,
  "descricao" TEXT,
  "decisao" "DecisaoOrcamento" NOT NULL DEFAULT 'PENDENTE',
  "modoDecisao" "ModoDecisaoOrcamento",
  "decisaoEm" TIMESTAMP(3),
  "decisaoPorId" TEXT,
  "responsavelExterno" TEXT,
  "dataAutorizacaoExterna" TIMESTAMP(3),
  "autorizacaoExternaObs" TEXT,
  "nomeArquivo" TEXT,
  "mimeType" TEXT,
  "conteudo" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtendimentoOrcamento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AtendimentoOrcamento_atendimentoId_versao_key"
  ON "AtendimentoOrcamento"("atendimentoId", "versao");
CREATE INDEX IF NOT EXISTS "AtendimentoOrcamento_atendimentoId_idx" ON "AtendimentoOrcamento"("atendimentoId");

CREATE TABLE IF NOT EXISTS "AtendimentoExternoDocumento" (
  "id" TEXT NOT NULL,
  "atendimentoId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL DEFAULT 'COMPROVANTE',
  "nomeArquivo" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "descricao" TEXT,
  "usuarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtendimentoExternoDocumento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AtendimentoExternoDocumento_atendimentoId_idx"
  ON "AtendimentoExternoDocumento"("atendimentoId");

CREATE TABLE IF NOT EXISTS "AtendimentoExternoEvento" (
  "id" TEXT NOT NULL,
  "atendimentoId" TEXT NOT NULL,
  "acao" TEXT NOT NULL,
  "detalhe" TEXT,
  "usuarioId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtendimentoExternoEvento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AtendimentoExternoEvento_atendimentoId_createdAt_idx"
  ON "AtendimentoExternoEvento"("atendimentoId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "FornecedorContato"
    ADD CONSTRAINT "FornecedorContato_fornecedorId_fkey"
    FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FornecedorDocumento"
    ADD CONSTRAINT "FornecedorDocumento_fornecedorId_fkey"
    FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "FornecedorDocumento"
    ADD CONSTRAINT "FornecedorDocumento_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FornecedorNota"
    ADD CONSTRAINT "FornecedorNota_fornecedorId_fkey"
    FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "FornecedorNota"
    ADD CONSTRAINT "FornecedorNota_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FornecedorFabricante"
    ADD CONSTRAINT "FornecedorFabricante_fornecedorId_fkey"
    FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "FornecedorFabricante"
    ADD CONSTRAINT "FornecedorFabricante_fabricanteId_fkey"
    FOREIGN KEY ("fabricanteId") REFERENCES "Fabricante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContratoDocumento"
    ADD CONSTRAINT "ContratoDocumento_contratoId_fkey"
    FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ContratoDocumento"
    ADD CONSTRAINT "ContratoDocumento_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AtendimentoExterno"
    ADD CONSTRAINT "AtendimentoExterno_estabelecimentoId_fkey"
    FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoExterno"
    ADD CONSTRAINT "AtendimentoExterno_ordemServicoId_fkey"
    FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoExterno"
    ADD CONSTRAINT "AtendimentoExterno_equipamentoId_fkey"
    FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoExterno"
    ADD CONSTRAINT "AtendimentoExterno_fornecedorId_fkey"
    FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoExterno"
    ADD CONSTRAINT "AtendimentoExterno_contratoId_fkey"
    FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoExterno"
    ADD CONSTRAINT "AtendimentoExterno_conferenciaPorId_fkey"
    FOREIGN KEY ("conferenciaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoExterno"
    ADD CONSTRAINT "AtendimentoExterno_conferenciaColabId_fkey"
    FOREIGN KEY ("conferenciaColabId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AtendimentoOrcamento"
    ADD CONSTRAINT "AtendimentoOrcamento_atendimentoId_fkey"
    FOREIGN KEY ("atendimentoId") REFERENCES "AtendimentoExterno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoOrcamento"
    ADD CONSTRAINT "AtendimentoOrcamento_decisaoPorId_fkey"
    FOREIGN KEY ("decisaoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AtendimentoExternoDocumento"
    ADD CONSTRAINT "AtendimentoExternoDocumento_atendimentoId_fkey"
    FOREIGN KEY ("atendimentoId") REFERENCES "AtendimentoExterno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoExternoDocumento"
    ADD CONSTRAINT "AtendimentoExternoDocumento_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AtendimentoExternoEvento"
    ADD CONSTRAINT "AtendimentoExternoEvento_atendimentoId_fkey"
    FOREIGN KEY ("atendimentoId") REFERENCES "AtendimentoExterno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "AtendimentoExternoEvento"
    ADD CONSTRAINT "AtendimentoExternoEvento_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
