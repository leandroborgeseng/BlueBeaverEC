/**
 * E2/Q6 — preenche PlanoTeste/PlanoInstancia.procedimentoId a partir do procedimentoCodigo legado.
 * Idempotente (só FK nula). Uso:
 *   npx tsx scripts/backfill-plano-procedimento.ts --dry-run [--estabelecimento <id>]
 *   npx tsx scripts/backfill-plano-procedimento.ts            (grava; só com OK do Tech Lead/Leandro)
 * NÃO rodar contra banco real sem autorização.
 */
import { PrismaClient } from "@prisma/client";
import { backfillPlanoProcedimento } from "../src/laudos/backfill-plano-procedimento";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const i = args.indexOf("--estabelecimento");
  const estabelecimentoId = i >= 0 ? args[i + 1] : undefined;
  const prisma = new PrismaClient();
  try {
    const r = await backfillPlanoProcedimento(prisma as never, { dryRun, estabelecimentoId });
    for (const l of r.linhas) {
      console.log(`${l.tabela}\t${l.id}\t${l.codigo ?? "-"}\t${l.procedimentoId ?? "-"}\t${l.via ?? l.aviso ?? ""}`);
    }
    console.log(
      `${dryRun ? "[dry-run] " : ""}analisadas=${r.analisadas} resolvidas=${r.resolvidas} semProcedimento=${r.semProcedimento} gravadas=${r.gravadas}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
