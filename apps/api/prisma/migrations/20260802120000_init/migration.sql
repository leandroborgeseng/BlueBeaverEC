-- CreateEnum
CREATE TYPE "PerfilAcesso" AS ENUM ('ENGENHEIRO', 'GESTOR', 'TECNICO', 'SOLICITANTE', 'AUDITORIA', 'ADMIN');
CREATE TYPE "SituacaoEquipamento" AS ENUM ('ATIVO', 'EM_GARANTIA', 'EM_GARANTIA_ESTENDIDA', 'INATIVO', 'ARQUIVADO');
CREATE TYPE "Criticidade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA');
CREATE TYPE "PrioridadeOS" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');
CREATE TYPE "StatusOS" AS ENUM ('NAO_ATRIBUIDA', 'ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');
CREATE TYPE "TipoOS" AS ENUM ('CORRETIVA', 'PREVENTIVA', 'CALIBRACAO', 'TSE');
CREATE TYPE "UrgenciaSolicitacao" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'PARADA_CRITICA');
CREATE TYPE "StatusSolicitacao" AS ENUM ('PENDENTE', 'CONVERTIDA', 'RECUSADA');

CREATE TABLE "Estabelecimento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Estabelecimento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

CREATE TABLE "UsuarioEstabelecimento" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "perfil" "PerfilAcesso" NOT NULL,
    "setorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "UsuarioEstabelecimento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsuarioEstabelecimento_usuarioId_estabelecimentoId_key" ON "UsuarioEstabelecimento"("usuarioId", "estabelecimentoId");

CREATE TABLE "LogAcesso" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "detalhe" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogAcesso_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Setor" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Setor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Setor_estabelecimentoId_nome_key" ON "Setor"("estabelecimentoId", "nome");

CREATE TABLE "Fabricante" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Fabricante_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Fabricante_estabelecimentoId_nome_key" ON "Fabricante"("estabelecimentoId", "nome");

CREATE TABLE "Modelo" (
    "id" TEXT NOT NULL,
    "fabricanteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Modelo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Modelo_fabricanteId_nome_key" ON "Modelo"("fabricanteId", "nome");

CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Fornecedor_estabelecimentoId_nome_key" ON "Fornecedor"("estabelecimentoId", "nome");

CREATE TABLE "PlanoDescricao" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criticidade" "Criticidade" NOT NULL DEFAULT 'MEDIA',
    "vidaUtilAnos" INTEGER NOT NULL DEFAULT 10,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PlanoDescricao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanoDescricao_estabelecimentoId_nome_key" ON "PlanoDescricao"("estabelecimentoId", "nome");

CREATE TABLE "CentroCusto" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CentroCusto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CentroCusto_estabelecimentoId_codigo_key" ON "CentroCusto"("estabelecimentoId", "codigo");

CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "matricula" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "registroProfissional" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Colaborador_usuarioId_key" ON "Colaborador"("usuarioId");
CREATE UNIQUE INDEX "Colaborador_estabelecimentoId_matricula_key" ON "Colaborador"("estabelecimentoId", "matricula");

CREATE TABLE "Equipamento" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricaoId" TEXT NOT NULL,
    "fabricanteId" TEXT NOT NULL,
    "modeloId" TEXT NOT NULL,
    "setorId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "centroCustoId" TEXT,
    "patrimonio" TEXT,
    "nSerie" TEXT,
    "dataAquisicao" TIMESTAMP(3),
    "valorAquisicao" DECIMAL(14,2),
    "valorSubstituicao" DECIMAL(14,2),
    "situacao" "SituacaoEquipamento" NOT NULL DEFAULT 'ATIVO',
    "checklistRecebimentoPendente" BOOLEAN NOT NULL DEFAULT true,
    "registroAnvisa" TEXT,
    "validadeAnvisa" TIMESTAMP(3),
    "dataEndOfService" TIMESTAMP(3),
    "dataEndOfLife" TIMESTAMP(3),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Equipamento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Equipamento_estabelecimentoId_tag_key" ON "Equipamento"("estabelecimentoId", "tag");
CREATE INDEX "Equipamento_estabelecimentoId_situacao_idx" ON "Equipamento"("estabelecimentoId", "situacao");
CREATE INDEX "Equipamento_setorId_idx" ON "Equipamento"("setorId");

CREATE TABLE "HistoricoTag" (
    "id" TEXT NOT NULL,
    "equipamentoId" TEXT NOT NULL,
    "tagAnterior" TEXT NOT NULL,
    "tagNova" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrdemServico" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "codigo" TEXT,
    "equipamentoId" TEXT NOT NULL,
    "tipo" "TipoOS" NOT NULL DEFAULT 'CORRETIVA',
    "oficina" TEXT,
    "prioridade" "PrioridadeOS" NOT NULL DEFAULT 'MEDIA',
    "status" "StatusOS" NOT NULL DEFAULT 'NAO_ATRIBUIDA',
    "abertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechamento" TIMESTAMP(3),
    "responsavelId" TEXT,
    "pendencia" TEXT,
    "observacaoRequisicao" TEXT,
    "solicitacaoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrdemServico_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrdemServico_solicitacaoId_key" ON "OrdemServico"("solicitacaoId");
CREATE UNIQUE INDEX "OrdemServico_estabelecimentoId_numero_key" ON "OrdemServico"("estabelecimentoId", "numero");
CREATE INDEX "OrdemServico_estabelecimentoId_status_idx" ON "OrdemServico"("estabelecimentoId", "status");
CREATE INDEX "OrdemServico_equipamentoId_idx" ON "OrdemServico"("equipamentoId");

CREATE TABLE "LogOrdemServico" (
    "id" TEXT NOT NULL,
    "ordemServicoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "justificativa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LogOrdemServico_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SolicitacaoServico" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "protocolo" TEXT NOT NULL,
    "equipamentoId" TEXT,
    "setorNome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "urgencia" "UrgenciaSolicitacao" NOT NULL DEFAULT 'MEDIA',
    "solicitanteNome" TEXT NOT NULL,
    "ramal" TEXT,
    "status" "StatusSolicitacao" NOT NULL DEFAULT 'PENDENTE',
    "justificativaRecusa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SolicitacaoServico_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SolicitacaoServico_estabelecimentoId_protocolo_key" ON "SolicitacaoServico"("estabelecimentoId", "protocolo");
CREATE INDEX "SolicitacaoServico_estabelecimentoId_status_idx" ON "SolicitacaoServico"("estabelecimentoId", "status");

CREATE TABLE "ContadorSequencia" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ContadorSequencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContadorSequencia_estabelecimentoId_chave_key" ON "ContadorSequencia"("estabelecimentoId", "chave");

ALTER TABLE "UsuarioEstabelecimento" ADD CONSTRAINT "UsuarioEstabelecimento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsuarioEstabelecimento" ADD CONSTRAINT "UsuarioEstabelecimento_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogAcesso" ADD CONSTRAINT "LogAcesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Setor" ADD CONSTRAINT "Setor_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Fabricante" ADD CONSTRAINT "Fabricante_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Modelo" ADD CONSTRAINT "Modelo_fabricanteId_fkey" FOREIGN KEY ("fabricanteId") REFERENCES "Fabricante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanoDescricao" ADD CONSTRAINT "PlanoDescricao_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_descricaoId_fkey" FOREIGN KEY ("descricaoId") REFERENCES "PlanoDescricao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_fabricanteId_fkey" FOREIGN KEY ("fabricanteId") REFERENCES "Fabricante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "Setor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Equipamento" ADD CONSTRAINT "Equipamento_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HistoricoTag" ADD CONSTRAINT "HistoricoTag_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HistoricoTag" ADD CONSTRAINT "HistoricoTag_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrdemServico" ADD CONSTRAINT "OrdemServico_solicitacaoId_fkey" FOREIGN KEY ("solicitacaoId") REFERENCES "SolicitacaoServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LogOrdemServico" ADD CONSTRAINT "LogOrdemServico_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogOrdemServico" ADD CONSTRAINT "LogOrdemServico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SolicitacaoServico" ADD CONSTRAINT "SolicitacaoServico_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolicitacaoServico" ADD CONSTRAINT "SolicitacaoServico_equipamentoId_fkey" FOREIGN KEY ("equipamentoId") REFERENCES "Equipamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
