-- E2 (laudos v2): procedimentos versionados e publicados (crit. 5–11a, D-L1, 6e) e permissão especial
-- `procedimento.publicar` (Q1). Só aditiva: colunas nulas, sem default, sem backfill; nenhuma linha reescrita.
-- Índices aprovados pelo Tech Lead (Q2): código único por estabelecimento (parcial), um rascunho por
-- procedimento (parcial), ponteiro único da versão publicada, índice PlanoTeste.procedimentoId;
-- revisão TL 20/10: índices nas FKs novas PlanoInstancia.procedimentoId e Laudo.procedimentoVersaoId.
-- Os dois índices parciais existem só aqui (Prisma não expressa índice parcial).

-- CreateEnum
CREATE TYPE "StatusProcedimentoVersao" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "TipoDocumentoEmitido" AS ENUM ('LAUDO', 'CERTIFICADO');

-- AlterTable
ALTER TABLE "UsuarioEstabelecimento" ADD COLUMN "permissoesEspeciais" JSONB;

-- AlterTable
ALTER TABLE "PlanoTeste" ADD COLUMN "procedimentoId" TEXT;

-- AlterTable
ALTER TABLE "PlanoInstancia" ADD COLUMN "procedimentoId" TEXT;

-- AlterTable
ALTER TABLE "ProcedimentoLaudo" ADD COLUMN "codigo" TEXT,
ADD COLUMN "generico" BOOLEAN,
ADD COLUMN "paiId" TEXT,
ADD COLUMN "versaoPublicadaId" TEXT;

-- AlterTable
ALTER TABLE "ProcedimentoLaudoVersao" ADD COLUMN "arvore" JSONB,
ADD COLUMN "atualizadoEm" TIMESTAMP(3),
ADD COLUMN "certificadoCfg" JSONB,
ADD COLUMN "codigo" TEXT,
ADD COLUMN "generico" BOOLEAN,
ADD COLUMN "itensResolvidos" JSONB,
ADD COLUMN "norma" TEXT,
ADD COLUMN "paiId" TEXT,
ADD COLUMN "paiVersaoId" TEXT,
ADD COLUMN "publicadoEm" TIMESTAMP(3),
ADD COLUMN "publicadoPorId" TEXT,
ADD COLUMN "publicadoPorNome" TEXT,
ADD COLUMN "status" "StatusProcedimentoVersao",
ADD COLUMN "tipoDocumento" "TipoDocumentoEmitido",
ADD COLUMN "tituloLaudo" TEXT;

-- AlterTable
ALTER TABLE "Laudo" ADD COLUMN "procedimentoVersaoId" TEXT,
ADD COLUMN "tipoDocumento" "TipoDocumentoEmitido";

-- CreateIndex (FK nova; aprovado na revisão do TL 20/10)
CREATE INDEX "PlanoInstancia_procedimentoId_idx" ON "PlanoInstancia"("procedimentoId");

-- CreateIndex (FK nova; aprovado na revisão do TL 20/10)
CREATE INDEX "Laudo_procedimentoVersaoId_idx" ON "Laudo"("procedimentoVersaoId");

-- CreateIndex
CREATE INDEX "PlanoTeste_procedimentoId_idx" ON "PlanoTeste"("procedimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcedimentoLaudo_versaoPublicadaId_key" ON "ProcedimentoLaudo"("versaoPublicadaId");

-- AddForeignKey
ALTER TABLE "PlanoTeste" ADD CONSTRAINT "PlanoTeste_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "ProcedimentoLaudo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanoInstancia" ADD CONSTRAINT "PlanoInstancia_procedimentoId_fkey" FOREIGN KEY ("procedimentoId") REFERENCES "ProcedimentoLaudo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcedimentoLaudo" ADD CONSTRAINT "ProcedimentoLaudo_paiId_fkey" FOREIGN KEY ("paiId") REFERENCES "ProcedimentoLaudo"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ProcedimentoLaudo" ADD CONSTRAINT "ProcedimentoLaudo_versaoPublicadaId_fkey" FOREIGN KEY ("versaoPublicadaId") REFERENCES "ProcedimentoLaudoVersao"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Laudo" ADD CONSTRAINT "Laudo_procedimentoVersaoId_fkey" FOREIGN KEY ("procedimentoVersaoId") REFERENCES "ProcedimentoLaudoVersao"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- CreateIndex (parcial; fora do schema.prisma)
CREATE UNIQUE INDEX "ProcedimentoLaudo_estabelecimentoId_codigo_key" ON "ProcedimentoLaudo"("estabelecimentoId", "codigo") WHERE "codigo" IS NOT NULL;

-- CreateIndex (parcial; fora do schema.prisma)
CREATE UNIQUE INDEX "ProcedimentoLaudoVersao_procedimentoId_rascunho_key" ON "ProcedimentoLaudoVersao"("procedimentoId") WHERE "status" = 'RASCUNHO';
