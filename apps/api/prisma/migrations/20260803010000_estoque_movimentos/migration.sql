-- CreateEnum
CREATE TYPE "TipoMovimentoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'RESERVA', 'BAIXA', 'LIBERACAO', 'REPOSICAO_SOLICITADA');

-- CreateTable
CREATE TABLE "EstoqueMovimento" (
    "id" TEXT NOT NULL,
    "estabelecimentoId" TEXT NOT NULL,
    "estoqueItemId" TEXT NOT NULL,
    "tipo" "TipoMovimentoEstoque" NOT NULL,
    "quantidade" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT,
    "osNumero" INTEGER,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstoqueMovimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EstoqueMovimento_estabelecimentoId_createdAt_idx" ON "EstoqueMovimento"("estabelecimentoId", "createdAt");

-- CreateIndex
CREATE INDEX "EstoqueMovimento_estoqueItemId_idx" ON "EstoqueMovimento"("estoqueItemId");

-- AddForeignKey
ALTER TABLE "EstoqueMovimento" ADD CONSTRAINT "EstoqueMovimento_estoqueItemId_fkey" FOREIGN KEY ("estoqueItemId") REFERENCES "EstoqueItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
