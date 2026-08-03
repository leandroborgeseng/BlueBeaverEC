/**
 * Importa biblioteca de POPs (PDF Final) — metadados + referência ao arquivo em disco.
 *
 * Uso:
 *   pnpm exec tsx scripts/import-pops-biblioteca.ts
 *   pnpm exec tsx scripts/import-pops-biblioteca.ts scripts/dados/pops-biblioteca --force
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { CategoriaPop, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FILE_RE = /^POP\.EC\.(MP|CAL|SEG|QLF)\.(\d+)_(.+)\.pdf$/i;

const CAT_MAP: Record<string, CategoriaPop> = {
  MP: CategoriaPop.PREVENTIVA,
  CAL: CategoriaPop.CALIBRACAO,
  SEG: CategoriaPop.TSE,
  QLF: CategoriaPop.QUALIFICACAO,
};

const CAT_LABEL: Record<string, string> = {
  MP: "Manutenção Preventiva",
  CAL: "Calibração",
  SEG: "Segurança Elétrica (TSE)",
  QLF: "Qualificação / Validação térmica",
};

function humanize(slug: string) {
  return slug
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const force = process.argv.includes("--force");
  const dirArg = process.argv.find((a) => !a.startsWith("--") && a !== process.argv[0] && a !== process.argv[1]);
  const dir = resolve(dirArg && !dirArg.endsWith(".ts") ? dirArg : "scripts/dados/pops-biblioteca");

  if (!existsSync(dir)) {
    console.error(`Pasta não encontrada: ${dir}`);
    process.exit(1);
  }

  const estab = await prisma.estabelecimento.findFirst({ orderBy: { createdAt: "asc" } });
  if (!estab) {
    console.error("Nenhum estabelecimento. Rode o seed antes.");
    process.exit(1);
  }

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  const existentes = await prisma.pop.count({ where: { estabelecimentoId: estab.id } });

  if (!force && existentes >= files.length && files.length > 0) {
    console.log(`[nexo] pops biblioteca: ${existentes} registros · skip (use --force)`);
    return;
  }

  console.log(`[nexo] pops biblioteca: ${files.length} PDF(s) · estab=${estab.nome}`);

  let upserts = 0;
  const erros: string[] = [];
  const porCat: Record<string, number> = {};

  for (const file of files) {
    const m = FILE_RE.exec(file);
    if (!m) {
      erros.push(`${file}: nome fora do padrão POP.EC.{MP|CAL|SEG|QLF}.NNN_Titulo.pdf`);
      continue;
    }
    const fam = m[1].toUpperCase();
    const num = m[2];
    const slug = m[3];
    const codigo = `POP.EC.${fam}.${num}`;
    const categoria = CAT_MAP[fam];
    const equipamentoTitulo = humanize(slug);
    const titulo = `${CAT_LABEL[fam] ?? fam} — ${equipamentoTitulo}`;
    const tamanhoBytes = statSync(resolve(dir, file)).size;
    porCat[fam] = (porCat[fam] ?? 0) + 1;

    await prisma.pop.upsert({
      where: {
        estabelecimentoId_codigo: { estabelecimentoId: estab.id, codigo },
      },
      update: {
        titulo,
        categoria,
        equipamentoTitulo,
        nomeArquivo: file,
        tamanhoBytes,
        status: "VIGENTE",
        versao: "1.0",
      },
      create: {
        estabelecimentoId: estab.id,
        codigo,
        titulo,
        categoria,
        equipamentoTitulo,
        nomeArquivo: file,
        tamanhoBytes,
        status: "VIGENTE",
        versao: "1.0",
      },
    });
    upserts += 1;
  }

  console.log(
    JSON.stringify(
      {
        pasta: basename(dir),
        arquivos: files.length,
        upserts,
        porFamilia: porCat,
        erros: erros.length,
        detalhesErros: erros,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
