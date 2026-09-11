import { PerfilAcesso, StatusOS } from "@prisma/client";
import { funcaoResponsavelOS, podeReceberAtribuicaoOS } from "@aion/shared";
import type { PrismaService } from "../prisma/prisma.service";

const CARGO_PADRAO: Record<string, string> = {
  ENGENHEIRO: "Engenheiro clínico",
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  TECNICO: "Técnico em equipamentos",
  TECNICO_RESTRITO: "Técnico de campo",
  AUDITORIA: "Auditoria",
};

/** Quem precisa de colaborador para aparecer na atribuição (não cria técnico em massa). */
const PERFIS_GARANTIR_COLABORADOR: PerfilAcesso[] = [
  PerfilAcesso.ENGENHEIRO,
  PerfilAcesso.ADMIN,
  PerfilAcesso.GESTOR,
];

function prefixoMatricula(perfil: string) {
  if (perfil === "ENGENHEIRO") return "ENG";
  if (perfil === "ADMIN") return "ADM";
  if (perfil === "GESTOR") return "GES";
  if (perfil === "TECNICO_RESTRITO") return "TCR";
  if (perfil === "TECNICO") return "TEC";
  return "COL";
}

function matriculaBase(perfil: string, usuarioId: string) {
  const idPart = usuarioId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase() || "000000";
  return `${prefixoMatricula(perfil)}-${idPart}`;
}

export async function ensureColaboradorUsuario(
  prisma: PrismaService,
  opts: {
    estabelecimentoId: string;
    usuarioId: string;
    nome: string;
    perfil: string;
  },
) {
  if (!podeReceberAtribuicaoOS(opts.perfil)) return null;

  const existente = await prisma.colaborador.findUnique({
    where: { usuarioId: opts.usuarioId },
  });

  if (existente && existente.estabelecimentoId === opts.estabelecimentoId) {
    if (!existente.ativo) {
      return prisma.colaborador.update({
        where: { id: existente.id },
        data: { ativo: true },
      });
    }
    return existente;
  }

  const cargo = CARGO_PADRAO[opts.perfil] ?? null;
  const created = await criarColaboradorComMatricula(prisma, {
    estabelecimentoId: opts.estabelecimentoId,
    nome: opts.nome,
    cargo,
    perfil: opts.perfil,
    usuarioId: existente ? undefined : opts.usuarioId,
  });

  if (existente) {
    await prisma.$transaction([
      prisma.colaborador.update({
        where: { id: existente.id },
        data: { usuarioId: null },
      }),
      prisma.colaborador.update({
        where: { id: created.id },
        data: { usuarioId: opts.usuarioId },
      }),
    ]);
  }

  return prisma.colaborador.findFirst({
    where: { usuarioId: opts.usuarioId, estabelecimentoId: opts.estabelecimentoId },
  });
}

async function criarColaboradorComMatricula(
  prisma: PrismaService,
  opts: {
    estabelecimentoId: string;
    nome: string;
    cargo: string | null;
    perfil: string;
    usuarioId?: string;
  },
) {
  const base = matriculaBase(opts.perfil, opts.usuarioId ?? opts.nome);
  for (let i = 0; i < 8; i++) {
    const matricula = i === 0 ? base : `${base}-${i + 1}`;
    try {
      return await prisma.colaborador.create({
        data: {
          estabelecimentoId: opts.estabelecimentoId,
          usuarioId: opts.usuarioId,
          nome: opts.nome,
          matricula,
          cargo: opts.cargo,
          ativo: true,
        },
      });
    } catch (e) {
      const code = typeof e === "object" && e && "code" in e ? String((e as { code?: string }).code) : "";
      if (code === "P2002") continue;
      throw e;
    }
  }
  throw new Error(`Não foi possível gerar matrícula para ${opts.nome}`);
}

export async function ensureColaboradoresEngenheiros(prisma: PrismaService, estabelecimentoId: string) {
  const vinculos = await prisma.usuarioEstabelecimento.findMany({
    where: {
      estabelecimentoId,
      perfil: { in: PERFIS_GARANTIR_COLABORADOR },
      usuario: { ativo: true },
    },
    include: { usuario: true },
  });

  for (const v of vinculos) {
    await ensureColaboradorUsuario(prisma, {
      estabelecimentoId,
      usuarioId: v.usuarioId,
      nome: v.usuario.nome,
      perfil: v.perfil,
    });
  }
}

export async function listarResponsaveisAtribuiveis(prisma: PrismaService, estabelecimentoId: string) {
  await ensureColaboradoresEngenheiros(prisma, estabelecimentoId);

  const rows = await prisma.colaborador.findMany({
    where: { estabelecimentoId, ativo: true },
    include: {
      usuario: {
        include: {
          estabelecimentos: {
            where: { estabelecimentoId },
            select: { perfil: true },
          },
        },
      },
      osResponsavel: {
        where: { status: { in: [StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] } },
        select: { id: true },
      },
    },
    orderBy: { nome: "asc" },
  });

  return rows
    .filter((c) => {
      const perfil = c.usuario?.estabelecimentos[0]?.perfil;
      if (!perfil) return true;
      return podeReceberAtribuicaoOS(perfil);
    })
    .map((c) => {
      const perfil = c.usuario?.estabelecimentos[0]?.perfil ?? null;
      const cargaAtual = c.osResponsavel.length;
      return {
        id: c.id,
        nome: c.nome,
        matricula: c.matricula,
        cargo: c.cargo,
        perfil,
        funcao: funcaoResponsavelOS(perfil, c.cargo),
        cargaAtual,
        sobrecarga: cargaAtual >= 2,
      };
    });
}

export async function colaboradorPodeReceberOS(
  prisma: PrismaService,
  estabelecimentoId: string,
  colaboradorId: string,
) {
  const colab = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, estabelecimentoId, ativo: true },
    include: {
      usuario: {
        include: {
          estabelecimentos: {
            where: { estabelecimentoId },
            select: { perfil: true },
          },
        },
      },
    },
  });
  if (!colab) return false;
  const perfil = colab.usuario?.estabelecimentos[0]?.perfil;
  if (!perfil) return true;
  return podeReceberAtribuicaoOS(perfil);
}
