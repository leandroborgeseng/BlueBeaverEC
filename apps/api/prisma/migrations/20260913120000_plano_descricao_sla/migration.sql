-- SLA operacional por tipo de equipamento (PlanoDescricao).
-- Não destrutivo: só adiciona colunas anuláveis.

ALTER TABLE "PlanoDescricao" ADD COLUMN IF NOT EXISTS "slaAtendimentoHoras" INTEGER;
ALTER TABLE "PlanoDescricao" ADD COLUMN IF NOT EXISTS "slaConclusaoHoras" INTEGER;
