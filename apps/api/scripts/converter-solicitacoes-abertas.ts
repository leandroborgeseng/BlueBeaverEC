/**
 * Converte solicitações PENDENTE (sem OS) em OS corretiva não atribuída.
 * Idempotente: se já existir OS no pedido, só marca CONVERTIDA.
 *
 * Uso: pnpm exec tsx scripts/converter-solicitacoes-abertas.ts
 */
import { PrismaClient, StatusSolicitacao } from "@prisma/client";
import { converterSolicitacaoEmOs } from "../src/solicitacoes/converter-solicitacao-em-os";

const prisma = new PrismaClient();

async function main() {
  const pendentes = await prisma.solicitacaoServico.findMany({
    where: {
      status: StatusSolicitacao.PENDENTE,
      ordemServico: null,
    },
    orderBy: { createdAt: "asc" },
  });

  let criadas = 0;
  let jaTinham = 0;

  for (const sol of pendentes) {
    const { created } = await converterSolicitacaoEmOs(prisma, sol);
    if (created) criadas += 1;
    else jaTinham += 1;
  }

  const convertidasSemOs = await prisma.solicitacaoServico.findMany({
    where: {
      status: StatusSolicitacao.CONVERTIDA,
      ordemServico: null,
    },
  });
  for (const sol of convertidasSemOs) {
    const { created } = await converterSolicitacaoEmOs(prisma, sol);
    if (created) criadas += 1;
    else jaTinham += 1;
  }

  console.log(
    `[aion] solicitacoes→OS: pendentes=${pendentes.length} convertidasSemOs=${convertidasSemOs.length} criadas=${criadas} idempotentes=${jaTinham}`,
  );
}

main()
  .catch((e) => {
    console.error("[aion] converter solicitacoes abertas falhou:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
