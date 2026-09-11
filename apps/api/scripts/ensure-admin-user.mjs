#!/usr/bin/env node
/**
 * Garante o super administrador de produção a cada boot (idempotente).
 * Hospital: o mesmo do inventário HEF (parque com equipamentos), senão
 * estab_modelo, senão o primeiro estabelecimento do banco.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient, PerfilAcesso } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const ADMIN_EMAIL = "leandro.borges@aion.eng.br";
const ADMIN_NOME = "Leandro Borges";
const ADMIN_PASSWORD = "Lean777$";
const ESTAB_FALLBACK_ID = "estab_modelo";

const prisma = new PrismaClient();

async function resolveHospital() {
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
    create: { id: ESTAB_FALLBACK_ID, nome: "Hospital e Maternidade Modelo" },
  });
}

try {
  const hospital = await resolveHospital();
  const senhaHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const user = await prisma.usuario.upsert({
    where: { email: ADMIN_EMAIL },
    update: { senhaHash, nome: ADMIN_NOME, ativo: true },
    create: { email: ADMIN_EMAIL, nome: ADMIN_NOME, senhaHash, ativo: true },
  });

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
