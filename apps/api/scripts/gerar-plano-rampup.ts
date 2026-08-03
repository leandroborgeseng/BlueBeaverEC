/**
 * CLI: gera (ou pré-visualiza) o ramp-up de planos em 3 meses.
 *
 *   pnpm exec tsx scripts/gerar-plano-rampup.ts
 *   pnpm exec tsx scripts/gerar-plano-rampup.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PlanosService } from "../src/planos/planos.service";

async function main() {
  const apply = process.argv.includes("--apply");
  const prisma = new PrismaClient();
  const service = new PlanosService(prisma);

  const estab = await prisma.estabelecimento.findFirst({ orderBy: { createdAt: "asc" } });
  if (!estab) {
    console.error("Nenhum estabelecimento.");
    process.exit(1);
  }

  if (!apply) {
    const preview = await service.previewRampUp(estab.id, {
      horizonteDias: 90,
      forcarAnual: true,
    });
    console.log(JSON.stringify(preview, null, 2));
    console.log("\n[dry-run] Passe --apply para criar as OS.");
  } else {
    const fakeUser = {
      userId: "script",
      estabelecimentoId: estab.id,
      perfil: "ADMIN" as const,
      email: "script@local",
    };
    const result = await service.gerarRampUp(fakeUser, {
      horizonteDias: 90,
      forcarAnual: true,
    });
    console.log(JSON.stringify(result, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
