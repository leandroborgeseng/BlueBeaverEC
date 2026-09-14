-- Documentos controlados, treinamentos, ocorrências de segurança e alertas de campo.
-- Aditivo: não apaga equipamentos, OS, laudos, inventário nem usuários.

DO $$ BEGIN
  CREATE TYPE "CategoriaDocumentoControlado" AS ENUM ('PROCEDIMENTO', 'INSTRUCAO', 'INSTITUCIONAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusDocumentoControlado" AS ENUM ('RASCUNHO', 'VIGENTE', 'OBSOLETO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "OrigemDocumentoControlado" AS ENUM ('INSTITUCIONAL', 'BIBLIOTECA_POP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoVinculoDocumento" AS ENUM ('EQUIPAMENTO', 'MODELO', 'INTERVENCAO', 'SETOR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoTreinamentoQualidade" AS ENUM ('INICIAL', 'RECICLAGEM', 'EDUCACAO_CONTINUADA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoOcorrenciaSeguranca" AS ENUM ('FALHA', 'INCIDENTE', 'SUSPEITA_EVENTO_ADVERSO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusOcorrenciaSeguranca" AS ENUM ('ABERTA', 'EM_INVESTIGACAO', 'ACOES_EM_ANDAMENTO', 'CONCLUIDA');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoAlertaCampo" AS ENUM ('ALERTA_FABRICANTE', 'RECOLHIMENTO', 'ACAO_DE_CAMPO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusAlertaCampo" AS ENUM ('ABERTO', 'EM_ANDAMENTO', 'CONCLUIDO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ArquivoQualidade" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "nomeArquivo" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "conteudo" BYTEA NOT NULL,
  "tamanhoBytes" INTEGER NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArquivoQualidade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentoControlado" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "titulo" TEXT NOT NULL,
  "categoria" "CategoriaDocumentoControlado" NOT NULL,
  "origem" "OrigemDocumentoControlado" NOT NULL DEFAULT 'INSTITUCIONAL',
  "popId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentoControlado_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentoVersao" (
  "id" TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "versao" TEXT NOT NULL,
  "status" "StatusDocumentoControlado" NOT NULL DEFAULT 'RASCUNHO',
  "responsavelId" TEXT,
  "dataVigencia" TIMESTAMP(3),
  "dataRevisao" TIMESTAMP(3),
  "proximaRevisao" TIMESTAMP(3),
  "observacao" TEXT,
  "arquivoId" TEXT,
  "createdById" TEXT,
  "publicadoPorId" TEXT,
  "publicadoEm" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentoVersao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentoVinculo" (
  "id" TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "tipo" "TipoVinculoDocumento" NOT NULL,
  "equipamentoId" TEXT,
  "modeloId" TEXT,
  "setorId" TEXT,
  "tipoIntervencao" TEXT,
  CONSTRAINT "DocumentoVinculo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Treinamento" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "tema" TEXT NOT NULL,
  "tipo" "TipoTreinamentoQualidade" NOT NULL DEFAULT 'INICIAL',
  "instrutorNome" TEXT NOT NULL,
  "instrutorId" TEXT,
  "data" TIMESTAMP(3) NOT NULL,
  "publico" TEXT,
  "documentoId" TEXT,
  "popId" TEXT,
  "arquivoId" TEXT,
  "observacao" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Treinamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TreinamentoEquipamento" (
  "id" TEXT NOT NULL,
  "treinamentoId" TEXT NOT NULL,
  "equipamentoId" TEXT NOT NULL,
  CONSTRAINT "TreinamentoEquipamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TreinamentoParticipante" (
  "id" TEXT NOT NULL,
  "treinamentoId" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "presente" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "TreinamentoParticipante_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TreinamentoEvidencia" (
  "id" TEXT NOT NULL,
  "treinamentoId" TEXT NOT NULL,
  "arquivoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TreinamentoEvidencia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OcorrenciaSeguranca" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "tipo" "TipoOcorrenciaSeguranca" NOT NULL,
  "status" "StatusOcorrenciaSeguranca" NOT NULL DEFAULT 'ABERTA',
  "equipamentoId" TEXT,
  "setorId" TEXT,
  "dataOcorrido" TIMESTAMP(3) NOT NULL,
  "descricao" TEXT NOT NULL,
  "medidasImediatas" TEXT,
  "responsavelId" TEXT,
  "ordemServicoId" TEXT,
  "documentoId" TEXT,
  "naoConformidadeId" TEXT,
  "acessoSensivel" BOOLEAN NOT NULL DEFAULT false,
  "condicaoUsoSugerida" TEXT,
  "condicaoUsoAplicadaEm" TIMESTAMP(3),
  "condicaoUsoAplicadaPorId" TEXT,
  "createdById" TEXT,
  "concludedAt" TIMESTAMP(3),
  "concludedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OcorrenciaSeguranca_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OcorrenciaInvestigacao" (
  "id" TEXT NOT NULL,
  "ocorrenciaId" TEXT NOT NULL,
  "relato" TEXT NOT NULL,
  "hipotese" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OcorrenciaInvestigacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OcorrenciaAcao" (
  "id" TEXT NOT NULL,
  "ocorrenciaId" TEXT NOT NULL,
  "descricao" TEXT NOT NULL,
  "responsavelNome" TEXT,
  "prazo" TIMESTAMP(3),
  "concluidoEm" TIMESTAMP(3),
  "arquivoId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OcorrenciaAcao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OcorrenciaArquivo" (
  "id" TEXT NOT NULL,
  "ocorrenciaId" TEXT NOT NULL,
  "arquivoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OcorrenciaArquivo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AlertaCampo" (
  "id" TEXT NOT NULL,
  "estabelecimentoId" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "tipo" "TipoAlertaCampo" NOT NULL,
  "titulo" TEXT NOT NULL,
  "origem" TEXT NOT NULL,
  "dataRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "prazo" TIMESTAMP(3),
  "responsavelId" TEXT,
  "status" "StatusAlertaCampo" NOT NULL DEFAULT 'ABERTO',
  "protocoloComunicacaoExterna" TEXT,
  "observacao" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlertaCampo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AlertaCampoEquipamento" (
  "id" TEXT NOT NULL,
  "alertaId" TEXT NOT NULL,
  "equipamentoId" TEXT NOT NULL,
  CONSTRAINT "AlertaCampoEquipamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AlertaCampoArquivo" (
  "id" TEXT NOT NULL,
  "alertaId" TEXT NOT NULL,
  "arquivoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlertaCampoArquivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoControlado_estabelecimentoId_codigo_key" ON "DocumentoControlado"("estabelecimentoId", "codigo");
CREATE INDEX IF NOT EXISTS "DocumentoControlado_estabelecimentoId_categoria_idx" ON "DocumentoControlado"("estabelecimentoId", "categoria");
CREATE INDEX IF NOT EXISTS "DocumentoVersao_documentoId_status_idx" ON "DocumentoVersao"("documentoId", "status");
CREATE INDEX IF NOT EXISTS "DocumentoVinculo_documentoId_idx" ON "DocumentoVinculo"("documentoId");
CREATE INDEX IF NOT EXISTS "DocumentoVinculo_equipamentoId_idx" ON "DocumentoVinculo"("equipamentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "Treinamento_estabelecimentoId_codigo_key" ON "Treinamento"("estabelecimentoId", "codigo");
CREATE INDEX IF NOT EXISTS "Treinamento_estabelecimentoId_data_idx" ON "Treinamento"("estabelecimentoId", "data");
CREATE UNIQUE INDEX IF NOT EXISTS "TreinamentoEquipamento_treinamentoId_equipamentoId_key" ON "TreinamentoEquipamento"("treinamentoId", "equipamentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "TreinamentoParticipante_treinamentoId_colaboradorId_key" ON "TreinamentoParticipante"("treinamentoId", "colaboradorId");
CREATE INDEX IF NOT EXISTS "TreinamentoEvidencia_treinamentoId_idx" ON "TreinamentoEvidencia"("treinamentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "OcorrenciaSeguranca_estabelecimentoId_codigo_key" ON "OcorrenciaSeguranca"("estabelecimentoId", "codigo");
CREATE INDEX IF NOT EXISTS "OcorrenciaSeguranca_estabelecimentoId_status_idx" ON "OcorrenciaSeguranca"("estabelecimentoId", "status");
CREATE INDEX IF NOT EXISTS "OcorrenciaSeguranca_estabelecimentoId_tipo_idx" ON "OcorrenciaSeguranca"("estabelecimentoId", "tipo");
CREATE INDEX IF NOT EXISTS "OcorrenciaSeguranca_equipamentoId_idx" ON "OcorrenciaSeguranca"("equipamentoId");
CREATE INDEX IF NOT EXISTS "OcorrenciaSeguranca_setorId_idx" ON "OcorrenciaSeguranca"("setorId");
CREATE INDEX IF NOT EXISTS "OcorrenciaSeguranca_dataOcorrido_idx" ON "OcorrenciaSeguranca"("dataOcorrido");
CREATE INDEX IF NOT EXISTS "OcorrenciaInvestigacao_ocorrenciaId_idx" ON "OcorrenciaInvestigacao"("ocorrenciaId");
CREATE INDEX IF NOT EXISTS "OcorrenciaAcao_ocorrenciaId_idx" ON "OcorrenciaAcao"("ocorrenciaId");
CREATE INDEX IF NOT EXISTS "OcorrenciaArquivo_ocorrenciaId_idx" ON "OcorrenciaArquivo"("ocorrenciaId");
CREATE UNIQUE INDEX IF NOT EXISTS "AlertaCampo_estabelecimentoId_codigo_key" ON "AlertaCampo"("estabelecimentoId", "codigo");
CREATE INDEX IF NOT EXISTS "AlertaCampo_estabelecimentoId_tipo_idx" ON "AlertaCampo"("estabelecimentoId", "tipo");
CREATE INDEX IF NOT EXISTS "AlertaCampo_estabelecimentoId_status_idx" ON "AlertaCampo"("estabelecimentoId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "AlertaCampoEquipamento_alertaId_equipamentoId_key" ON "AlertaCampoEquipamento"("alertaId", "equipamentoId");
CREATE INDEX IF NOT EXISTS "AlertaCampoArquivo_alertaId_idx" ON "AlertaCampoArquivo"("alertaId");
CREATE INDEX IF NOT EXISTS "ArquivoQualidade_estabelecimentoId_idx" ON "ArquivoQualidade"("estabelecimentoId");

DO $$ BEGIN
  ALTER TABLE "ArquivoQualidade" ADD CONSTRAINT "ArquivoQualidade_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ArquivoQualidade" ADD CONSTRAINT "ArquivoQualidade_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoControlado" ADD CONSTRAINT "DocumentoControlado_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoControlado" ADD CONSTRAINT "DocumentoControlado_popId_fkey" FOREIGN KEY ("popId") REFERENCES "Pop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVersao" ADD CONSTRAINT "DocumentoVersao_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoControlado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVersao" ADD CONSTRAINT "DocumentoVersao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVersao" ADD CONSTRAINT "DocumentoVersao_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "ArquivoQualidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVersao" ADD CONSTRAINT "DocumentoVersao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVersao" ADD CONSTRAINT "DocumentoVersao_publicadoPorId_fkey" FOREIGN KEY ("publicadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVinculo" ADD CONSTRAINT "DocumentoVinculo_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoControlado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVinculo" ADD CONSTRAINT "DocumentoVinculo_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVinculo" ADD CONSTRAINT "DocumentoVinculo_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoVinculo" ADD CONSTRAINT "DocumentoVinculo_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Treinamento" ADD CONSTRAINT "Treinamento_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Treinamento" ADD CONSTRAINT "Treinamento_instrutorId_fkey" FOREIGN KEY ("instrutorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Treinamento" ADD CONSTRAINT "Treinamento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoControlado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Treinamento" ADD CONSTRAINT "Treinamento_popId_fkey" FOREIGN KEY ("popId") REFERENCES "Pop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Treinamento" ADD CONSTRAINT "Treinamento_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "ArquivoQualidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Treinamento" ADD CONSTRAINT "Treinamento_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TreinamentoEquipamento" ADD CONSTRAINT "TreinamentoEquipamento_treinamentoId_fkey" FOREIGN KEY ("treinamentoId") REFERENCES "Treinamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TreinamentoEquipamento" ADD CONSTRAINT "TreinamentoEquipamento_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TreinamentoParticipante" ADD CONSTRAINT "TreinamentoParticipante_treinamentoId_fkey" FOREIGN KEY ("treinamentoId") REFERENCES "Treinamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TreinamentoParticipante" ADD CONSTRAINT "TreinamentoParticipante_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TreinamentoEvidencia" ADD CONSTRAINT "TreinamentoEvidencia_treinamentoId_fkey" FOREIGN KEY ("treinamentoId") REFERENCES "Treinamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TreinamentoEvidencia" ADD CONSTRAINT "TreinamentoEvidencia_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "ArquivoQualidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "DocumentoControlado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_naoConformidadeId_fkey" FOREIGN KEY ("naoConformidadeId") REFERENCES "NaoConformidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_concludedById_fkey" FOREIGN KEY ("concludedById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaSeguranca" ADD CONSTRAINT "OcorrenciaSeguranca_condicaoUsoAplicadaPorId_fkey" FOREIGN KEY ("condicaoUsoAplicadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaInvestigacao" ADD CONSTRAINT "OcorrenciaInvestigacao_ocorrenciaId_fkey" FOREIGN KEY ("ocorrenciaId") REFERENCES "OcorrenciaSeguranca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaInvestigacao" ADD CONSTRAINT "OcorrenciaInvestigacao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaAcao" ADD CONSTRAINT "OcorrenciaAcao_ocorrenciaId_fkey" FOREIGN KEY ("ocorrenciaId") REFERENCES "OcorrenciaSeguranca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaAcao" ADD CONSTRAINT "OcorrenciaAcao_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "ArquivoQualidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaAcao" ADD CONSTRAINT "OcorrenciaAcao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaArquivo" ADD CONSTRAINT "OcorrenciaArquivo_ocorrenciaId_fkey" FOREIGN KEY ("ocorrenciaId") REFERENCES "OcorrenciaSeguranca"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OcorrenciaArquivo" ADD CONSTRAINT "OcorrenciaArquivo_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "ArquivoQualidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AlertaCampo" ADD CONSTRAINT "AlertaCampo_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AlertaCampo" ADD CONSTRAINT "AlertaCampo_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AlertaCampo" ADD CONSTRAINT "AlertaCampo_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AlertaCampoEquipamento" ADD CONSTRAINT "AlertaCampoEquipamento_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "AlertaCampo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AlertaCampoEquipamento" ADD CONSTRAINT "AlertaCampoEquipamento_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AlertaCampoArquivo" ADD CONSTRAINT "AlertaCampoArquivo_alertaId_fkey" FOREIGN KEY ("alertaId") REFERENCES "AlertaCampo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AlertaCampoArquivo" ADD CONSTRAINT "AlertaCampoArquivo_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "ArquivoQualidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
