/**
 * Importa checklists de calibração (JSON) como ProcedimentoLaudo e vincula ao Pop CAL.
 *
 * Uso:
 *   pnpm exec tsx scripts/import-checklists-calibracao.ts
 *   pnpm exec tsx scripts/import-checklists-calibracao.ts scripts/dados/checklists-calibracao --force
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PrismaClient, TipoLaudo } from "@prisma/client";

const prisma = new PrismaClient();

type ChecklistFile = {
  codigoPop: string;
  nome: string;
  tipo: "CALIBRACAO";
  validadeMeses: number;
  fonte?: string;
  notaMetrologia?: string;
  tolerancias?: unknown[];
  padroesSugeridos?: string[];
  itens: unknown[];
};

async function main() {
  const force = process.argv.includes("--force");
  const dirArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const dir = resolve(dirArg ?? "scripts/dados/checklists-calibracao");

  if (!existsSync(dir)) {
    console.error(`Pasta não encontrada: ${dir}`);
    process.exit(1);
  }

  const estab = await prisma.estabelecimento.findFirst({ orderBy: { createdAt: "asc" } });
  if (!estab) {
    console.error("Nenhum estabelecimento. Rode o seed antes.");
    process.exit(1);
  }

  const files = readdirSync(dir).filter(
    (f) => f.toLowerCase().endsWith(".json") && !f.startsWith("_"),
  );
  console.log(`[aion] checklists calibração: ${files.length} arquivo(s) · ${estab.nome}`);

  let upserts = 0;
  const erros: string[] = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as ChecklistFile;
      if (!raw.codigoPop || !raw.nome || !Array.isArray(raw.itens)) {
        erros.push(`${file}: JSON inválido (codigoPop/nome/itens)`);
        continue;
      }

      const pop = await prisma.pop.findUnique({
        where: {
          estabelecimentoId_codigo: {
            estabelecimentoId: estab.id,
            codigo: raw.codigoPop,
          },
        },
      });

      if (!pop && !force) {
        console.log(`[aion] ${raw.codigoPop}: Pop ainda não na biblioteca — cria procedimento mesmo assim`);
      }

      // metadados metrológicos ficam nos itens + campos no JSON do procedimento via itens
      const itensPayload = raw.itens as object[];

      let procId = pop?.procedimentoLaudoId ?? null;

      if (procId) {
        const existing = await prisma.procedimentoLaudo.findUnique({ where: { id: procId } });
        if (
          existing &&
          !force &&
          existing.tipo === TipoLaudo.CALIBRACAO &&
          Array.isArray(existing.itens) &&
          (existing.itens as unknown[]).length >= raw.itens.length
        ) {
          console.log(
            `[aion] ${raw.codigoPop}: procedimento já completo (${(existing.itens as unknown[]).length} itens) — skip`,
          );
          continue;
        }
        if (existing) {
          await prisma.procedimentoLaudo.update({
            where: { id: existing.id },
            data: {
              nome: raw.nome,
              tipo: TipoLaudo.CALIBRACAO,
              validadeMeses: raw.validadeMeses ?? 12,
              itens: itensPayload,
              ativo: true,
            },
          });
          procId = existing.id;
        } else {
          procId = null;
        }
      }

      if (!procId) {
        const byName = await prisma.procedimentoLaudo.findFirst({
          where: {
            estabelecimentoId: estab.id,
            nome: raw.nome,
            tipo: TipoLaudo.CALIBRACAO,
          },
        });
        if (byName) {
          await prisma.procedimentoLaudo.update({
            where: { id: byName.id },
            data: {
              validadeMeses: raw.validadeMeses ?? 12,
              itens: itensPayload,
              ativo: true,
            },
          });
          procId = byName.id;
        } else {
          const created = await prisma.procedimentoLaudo.create({
            data: {
              estabelecimentoId: estab.id,
              nome: raw.nome,
              tipo: TipoLaudo.CALIBRACAO,
              validadeMeses: raw.validadeMeses ?? 12,
              itens: itensPayload,
              ativo: true,
            },
          });
          procId = created.id;
        }
      }

      if (pop && pop.procedimentoLaudoId !== procId) {
        await prisma.pop.updateMany({
          where: { procedimentoLaudoId: procId, NOT: { id: pop.id } },
          data: { procedimentoLaudoId: null },
        });
        await prisma.pop.update({
          where: { id: pop.id },
          data: { procedimentoLaudoId: procId },
        });
      }

      upserts += 1;
      console.log(
        `[aion] OK ${raw.codigoPop} → procedimento ${procId} · ${raw.itens.length} itens` +
          (pop ? " · vinculado ao Pop" : ""),
      );
    } catch (e) {
      erros.push(`${file}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(JSON.stringify({ upserts, erros: erros.length, detalhesErros: erros }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
