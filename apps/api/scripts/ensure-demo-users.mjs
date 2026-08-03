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
  { email: "engenheiro@aion.local", nome: "Ana Engenheira", perfil: PerfilAcesso.ENGENHEIRO },
  { email: "tecnico@aion.local", nome: "Carlos Técnico", perfil: PerfilAcesso.TECNICO },
  { email: "solicitante@aion.local", nome: "Maria Solicitante", perfil: PerfilAcesso.SOLICITANTE },
];

const prisma = new PrismaClient();

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
  }

  console.log(`[aion] demo users ok · senha ${DEMO_PASSWORD} · engenheiro@aion.local`);
  process.exit(0);
} catch (e) {
  console.error("[aion] ensure-demo-users falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
