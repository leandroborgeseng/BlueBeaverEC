-- CreateEnum
CREATE TYPE "TipoItemOS" AS ENUM ('MATERIAL', 'MAO_DE_OBRA');

-- CreateTable
CREATE TABLE "OrdemServicoItem" (
    "id" TEXT NOT NULL,
    "ordemServicoId" TEXT NOT NULL,
    "tipo" "TipoItemOS" NOT NULL DEFAULT 'MATERIAL',
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(14,2),
    "estoqueItemId" TEXT,
    CONSTRAINT "OrdemServicoItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EstoqueItem" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "almoxarifado" TEXT NOT NULL DEFAULT 'Principal',
    "qtdAtual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "qtdMinima" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valorUnitario" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "EstoqueItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EstoqueItem_estabelecimentoId_codigo_key" ON "EstoqueItem"("estabelecimentoId", "codigo");

CREATE TABLE "EstoqueReserva" (
    "id" TEXT NOT NULL,
    "estoqueItemId" TEXT NOT NULL,
    "ordemServicoId" TEXT NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EstoqueReserva_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrdemServicoItem" ADD CONSTRAINT "OrdemServicoItem_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrdemServicoItem" ADD CONSTRAINT "OrdemServicoItem_estoqueItemId_fkey" FOREIGN KEY ("estoqueItemId") REFERENCES "EstoqueItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EstoqueItem" ADD CONSTRAINT "EstoqueItem_estabelecimentoId_fkey" FOREIGN KEY ("estabelecimentoId") REFERENCES "Estabelecimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstoqueReserva" ADD CONSTRAINT "EstoqueReserva_estoqueItemId_fkey" FOREIGN KEY ("estoqueItemId") REFERENCES "EstoqueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EstoqueReserva" ADD CONSTRAINT "EstoqueReserva_ordemServicoId_fkey" FOREIGN KEY ("ordemServicoId") REFERENCES "OrdemServico"("id") ON DELETE CASCADE ON UPDATE CASCADE;
