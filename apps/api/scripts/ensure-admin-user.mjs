#!/usr/bin/env node
/**
 * Garante o super administrador de produção a cada boot (idempotente).
 * Hospital: o do inventário oficial HEF (TAGs HEF-*), senão o de maior
 * parque, senão estab_modelo, senão o primeiro estabelecimento.
 * 
 * Credenciais vêm das variáveis de ambiente:
 * - ADMIN_EMAIL: e-mail do administrador
 * - ADMIN_NOME: nome completo do administrador
 * - ADMIN_PASSWORD: senha (apenas para criação inicial)
 * 
 * Se o usuário já existir, a senha NÃO será alterada.
 * Se as variáveis não estiverem definidas, o script será ignorado silenciosamente.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient, PerfilAcesso } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim();
const ADMIN_NOME = process.env.ADMIN_NOME?.trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim();
const ESTAB_FALLBACK_ID = "estab_modelo";

const prisma = new PrismaClient();

async function resolveHospital() {
  const comTagHef = await prisma.estabelecimento.findFirst({
    where: { equipamentos: { some: { tag: { startsWith: "HEF-" } } } },
    orderBy: { createdAt: "asc" },
  });
  if (comTagHef) return comTagHef;

  const lista = await prisma.estabelecimento.findMany({
    include: { _count: { select: { equipamentos: true } } },
    orderBy: { createdAt: "asc" },
  });
  const comParque = [...lista].sort((a, b) => b._count.equipamentos - a._count.equipamentos)[0];
  if (comParque && comParque._count.equipamentos > 0) return comParque;

  const byId = await prisma.estabelecimento.findUnique({ where: { id: ESTAB_FALLBACK_ID } });
  if (byId) return byId;
  if (lista[0]) return lista[0];

  return prisma.estabelecimento.upsert({
    where: { id: ESTAB_FALLBACK_ID },
    update: {},
    create: { id: ESTAB_FALLBACK_ID, nome: "Hospital Estadual de Formosa" },
  });
}

try {
  if (!ADMIN_EMAIL || !ADMIN_NOME || !ADMIN_PASSWORD) {
    console.log("[aion] admin bootstrap skipped (ADMIN_EMAIL, ADMIN_NOME ou ADMIN_PASSWORD ausente)");
    process.exit(0);
  }

  const hospital = await resolveHospital();

  const existingUser = await prisma.usuario.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  let user;
  if (existingUser) {
    user = await prisma.usuario.update({
      where: { email: ADMIN_EMAIL },
      update: { nome: ADMIN_NOME, ativo: true },
    });
    console.log(`[aion] admin já existe · ${ADMIN_EMAIL} · senha preservada`);
  } else {
    const senhaHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    user = await prisma.usuario.create({
      data: { email: ADMIN_EMAIL, nome: ADMIN_NOME, senhaHash, ativo: true },
    });
    console.log(`[aion] admin criado · ${ADMIN_EMAIL} · senha definida`);
  }

  await prisma.usuarioEstabelecimento.upsert({
    where: {
      usuarioId_estabelecimentoId: {
        usuarioId: user.id,
        estabelecimentoId: hospital.id,
      },
    },
    update: { perfil: PerfilAcesso.ADMIN },
    create: {
      usuarioId: user.id,
      estabelecimentoId: hospital.id,
      perfil: PerfilAcesso.ADMIN,
    },
  });

  await prisma.usuarioEstabelecimento.updateMany({
    where: { usuarioId: user.id },
    data: { perfil: PerfilAcesso.ADMIN },
  });

  console.log(`[aion] admin ok · ${ADMIN_EMAIL} · ADMIN · estab=${hospital.id} (${hospital.nome})`);
  process.exit(0);
} catch (e) {
  console.error("[aion] ensure-admin-user falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
