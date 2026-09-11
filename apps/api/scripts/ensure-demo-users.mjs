#!/usr/bin/env node
/**
 * Garante contas demo Aion a cada boot (mesmo com usuários já existentes).
 * Corrige banco legado: @nexo.local + senha nexo1234 → @aion.local + aion1234.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient, PerfilAcesso } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const DEMO_PASSWORD = "aion1234";
const ESTAB_ID = "estab_modelo";

const DEMOS = [
  { email: "engenheiro@aion.local", nome: "Ana Engenheira", perfil: PerfilAcesso.ENGENHEIRO, matricula: "ENG-001" },
  { email: "tecnico@aion.local", nome: "Carlos Técnico", perfil: PerfilAcesso.TECNICO, matricula: "TEC-001" },
  {
    email: "campo@aion.local",
    nome: "João Campo (restrito)",
    perfil: PerfilAcesso.TECNICO_RESTRITO,
    matricula: "TEC-R01",
  },
  { email: "solicitante@aion.local", nome: "Maria Solicitante", perfil: PerfilAcesso.SOLICITANTE, matricula: null },
];

const prisma = new PrismaClient();

async function resolveHospitalHef() {
  const comTagHef = await prisma.estabelecimento.findFirst({
    where: { equipamentos: { some: { tag: { startsWith: "HEF-" } } } },
    orderBy: { createdAt: "asc" },
  });
  return comTagHef;
}

async function ensureColab(hospitalId, user, demo) {
  if (!demo.matricula) return;
  const cargo =
    demo.perfil === PerfilAcesso.ENGENHEIRO
      ? "Engenheiro clínico"
      : demo.perfil === PerfilAcesso.TECNICO_RESTRITO
        ? "Técnico de campo"
        : "Técnico em equipamentos";
  const existingColab = await prisma.colaborador.findFirst({
    where: { estabelecimentoId: hospitalId, OR: [{ usuarioId: user.id }, { matricula: demo.matricula }] },
  });
  const byUser = await prisma.colaborador.findUnique({ where: { usuarioId: user.id } });
  if (byUser && byUser.id !== existingColab?.id) {
    await prisma.colaborador.update({ where: { id: byUser.id }, data: { usuarioId: null } });
  }
  if (existingColab) {
    await prisma.colaborador.update({
      where: { id: existingColab.id },
      data: { usuarioId: user.id, nome: demo.nome, matricula: demo.matricula, cargo, ativo: true },
    });
    return;
  }
  await prisma.colaborador.create({
    data: {
      estabelecimentoId: hospitalId,
      usuarioId: user.id,
      nome: demo.nome,
      matricula: demo.matricula,
      cargo,
      ativo: true,
    },
  });
}

try {
  const renamed = await prisma.$executeRawUnsafe(`
    UPDATE "Usuario"
    SET email = REPLACE(email, '@nexo.local', '@aion.local')
    WHERE email LIKE '%@nexo.local'
  `);
  if (renamed > 0) {
    console.log(`[aion] rebrand e-mails: ${renamed} usuário(s) @nexo.local → @aion.local`);
  }

  const senhaHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const hospital = await prisma.estabelecimento.upsert({
    where: { id: ESTAB_ID },
    update: { nome: "Hospital e Maternidade Modelo" },
    create: { id: ESTAB_ID, nome: "Hospital e Maternidade Modelo" },
  });

  for (const demo of DEMOS) {
    const user = await prisma.usuario.upsert({
      where: { email: demo.email },
      update: { senhaHash, nome: demo.nome, ativo: true },
      create: { email: demo.email, nome: demo.nome, senhaHash, ativo: true },
    });
    await prisma.usuarioEstabelecimento.upsert({
      where: {
        usuarioId_estabelecimentoId: {
          usuarioId: user.id,
          estabelecimentoId: hospital.id,
        },
      },
      update: { perfil: demo.perfil },
      create: {
        usuarioId: user.id,
        estabelecimentoId: hospital.id,
        perfil: demo.perfil,
      },
    });

    if (demo.matricula) {
      await ensureColab(hospital.id, user, demo);
    }
  }

  const hef = await resolveHospitalHef();
  if (hef && hef.id !== hospital.id) {
    for (const demo of DEMOS) {
      if (!demo.matricula) continue;
      const user = await prisma.usuario.findUnique({ where: { email: demo.email } });
      if (!user) continue;
      await prisma.usuarioEstabelecimento.upsert({
        where: {
          usuarioId_estabelecimentoId: {
            usuarioId: user.id,
            estabelecimentoId: hef.id,
          },
        },
        update: { perfil: demo.perfil },
        create: {
          usuarioId: user.id,
          estabelecimentoId: hef.id,
          perfil: demo.perfil,
        },
      });
      await ensureColab(hef.id, user, demo);
    }
    console.log(`[aion] demo users também no HEF · estab=${hef.id} (${hef.nome})`);
  }

  const uti =
    (await prisma.setor.findFirst({
      where: { estabelecimentoId: hospital.id, nome: { in: ["U.T.I.", "UTI Adulto", "UTI"] } },
    })) ??
    (await prisma.setor.findFirst({
      where: { estabelecimentoId: hospital.id, nome: { contains: "U.T.I.", mode: "insensitive" } },
    }));
  if (uti) {
    const solicitante = await prisma.usuario.findUnique({ where: { email: "solicitante@aion.local" } });
    if (solicitante) {
      await prisma.usuarioEstabelecimento.update({
        where: {
          usuarioId_estabelecimentoId: {
            usuarioId: solicitante.id,
            estabelecimentoId: hospital.id,
          },
        },
        data: { setorIds: [uti.id] },
      });
    }
  }

  console.log(
    `[aion] demo users ok · senha ${DEMO_PASSWORD} · campo@aion.local (TECNICO_RESTRITO)`,
  );
  process.exit(0);
} catch (e) {
  console.error("[aion] ensure-demo-users falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
