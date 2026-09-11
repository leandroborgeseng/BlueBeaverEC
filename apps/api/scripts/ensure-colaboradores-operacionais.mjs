#!/usr/bin/env node
/**
 * Garante colaborador para engenheiros (e ADMIN/GESTOR) no hospital HEF.
 * Idempotente. Não apaga inventário. Não cria técnico em massa.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient, PerfilAcesso } = require("@prisma/client");

const ESTAB_FALLBACK_ID = "estab_modelo";
const PERFIS_GARANTIR = [PerfilAcesso.ENGENHEIRO, PerfilAcesso.ADMIN, PerfilAcesso.GESTOR];
const CARGO_PADRAO = {
  ENGENHEIRO: "Engenheiro clínico",
  ADMIN: "Administrador",
  GESTOR: "Gestor",
};

const prisma = new PrismaClient();

function prefixoMatricula(perfil) {
  if (perfil === "ENGENHEIRO") return "ENG";
  if (perfil === "ADMIN") return "ADM";
  if (perfil === "GESTOR") return "GES";
  return "COL";
}

function matriculaBase(perfil, usuarioId) {
  const idPart = String(usuarioId).replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "000000";
  return `${prefixoMatricula(perfil)}-${idPart}`;
}

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
  return lista[0] ?? null;
}

async function criarComMatricula({ estabelecimentoId, nome, cargo, perfil, usuarioId }) {
  const base = matriculaBase(perfil, usuarioId ?? nome);
  for (let i = 0; i < 8; i++) {
    const matricula = i === 0 ? base : `${base}-${i + 1}`;
    try {
      return await prisma.colaborador.create({
        data: {
          estabelecimentoId,
          usuarioId,
          nome,
          matricula,
          cargo,
          ativo: true,
        },
      });
    } catch (e) {
      if (e?.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error(`Não foi possível gerar matrícula para ${nome}`);
}

async function ensureColaborador({ estabelecimentoId, usuarioId, nome, perfil }) {
  if (perfil === PerfilAcesso.SOLICITANTE) return null;

  const existente = await prisma.colaborador.findUnique({ where: { usuarioId } });
  if (existente && existente.estabelecimentoId === estabelecimentoId) {
    if (!existente.ativo) {
      await prisma.colaborador.update({ where: { id: existente.id }, data: { ativo: true } });
    }
    return existente;
  }

  const created = await criarComMatricula({
    estabelecimentoId,
    nome,
    cargo: CARGO_PADRAO[perfil] ?? null,
    perfil,
    usuarioId: existente ? undefined : usuarioId,
  });

  if (existente) {
    await prisma.$transaction([
      prisma.colaborador.update({ where: { id: existente.id }, data: { usuarioId: null } }),
      prisma.colaborador.update({ where: { id: created.id }, data: { usuarioId } }),
    ]);
  }
  return created;
}

try {
  const hospital = await resolveHospital();
  if (!hospital) {
    console.log("[aion] colaboradores operacionais: nenhum estabelecimento");
    process.exit(0);
  }

  const vinculos = await prisma.usuarioEstabelecimento.findMany({
    where: {
      estabelecimentoId: hospital.id,
      perfil: { in: PERFIS_GARANTIR },
      usuario: { ativo: true },
    },
    include: { usuario: true },
  });

  let criados = 0;
  for (const v of vinculos) {
    const before = await prisma.colaborador.findFirst({
      where: { usuarioId: v.usuarioId, estabelecimentoId: hospital.id },
    });
    await ensureColaborador({
      estabelecimentoId: hospital.id,
      usuarioId: v.usuarioId,
      nome: v.usuario.nome,
      perfil: v.perfil,
    });
    if (!before) criados += 1;
  }

  console.log(
    `[aion] colaboradores operacionais ok · estab=${hospital.id} (${hospital.nome}) · ${vinculos.length} perfil(is) · ${criados} novo(s)`,
  );
  process.exit(0);
} catch (e) {
  console.error("[aion] ensure-colaboradores-operacionais falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
