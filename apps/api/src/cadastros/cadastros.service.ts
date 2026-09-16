import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Criticidade, Prisma } from "@prisma/client";
import { podeEditarCadastros } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { listarResponsaveisAtribuiveis } from "../pessoas/responsaveis-os";

/** HP-30, hp 30 e HP_30 viram a mesma chave. */
export function chaveModelo(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function distancia(a: string, b: string) {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  const prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag : 1 + Math.min(diag, prev[j], prev[j - 1]);
      diag = tmp;
    }
  }
  return prev[m];
}

function agruparSimilares<T extends { id: string; nome: string }>(lista: T[]): Array<{ chave: string; itens: T[] }> {
  const buckets = new Map<string, T[]>();
  for (const item of lista) {
    const chave = chaveModelo(item.nome) || `id:${item.id}`;
    const bucket = buckets.get(chave) ?? [];
    bucket.push(item);
    buckets.set(chave, bucket);
  }

  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p !== k) {
      const r = find(p);
      parent.set(k, r);
      return r;
    }
    return k;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const chaves = [...buckets.keys()];
  for (const k of chaves) parent.set(k, k);
  for (let i = 0; i < chaves.length; i++) {
    for (let j = i + 1; j < chaves.length; j++) {
      const a = chaves[i];
      const b = chaves[j];
      if (a.startsWith("id:") || b.startsWith("id:")) continue;
      if (Math.min(a.length, b.length) < 6) continue;
      if (distancia(a, b) === 1) union(a, b);
    }
  }

  const clusters = new Map<string, T[]>();
  for (const [chave, rows] of buckets) {
    const root = find(chave);
    const acc = clusters.get(root) ?? [];
    acc.push(...rows);
    clusters.set(root, acc);
  }

  return [...clusters.entries()]
    .filter(([, itens]) => itens.length >= 2)
    .map(([chave, itens]) => ({ chave, itens }));
}

@Injectable()
export class CadastrosService {
  constructor(private readonly prisma: PrismaService) {}

  private assertEdit(user: AuthUser) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente Engenheiro/Gestor pode editar cadastros");
    }
  }

  fabricantes(estabelecimentoId: string, q?: string) {
    return this.prisma.fabricante.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      include: { _count: { select: { equipamentos: true, modelos: true } } },
      orderBy: { nome: "asc" },
      take: 2000,
    });
  }

  async createFabricante(user: AuthUser, nome: string) {
    this.assertEdit(user);
    return this.prisma.fabricante.create({
      data: { estabelecimentoId: user.estabelecimentoId, nome: nome.trim() },
    });
  }

  modelos(estabelecimentoId: string, fabricanteId?: string, q?: string) {
    return this.prisma.modelo.findMany({
      where: {
        ativo: true,
        fabricante: { estabelecimentoId },
        ...(fabricanteId ? { fabricanteId } : {}),
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      include: {
        fabricante: { select: { id: true, nome: true } },
        _count: { select: { equipamentos: true } },
      },
      orderBy: { nome: "asc" },
      take: 2000,
    });
  }

  async createModelo(user: AuthUser, fabricanteId: string, nome: string) {
    this.assertEdit(user);
    const fab = await this.prisma.fabricante.findFirst({
      where: { id: fabricanteId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!fab) throw new NotFoundException("Fabricante não encontrado");
    return this.prisma.modelo.create({
      data: { fabricanteId, nome: nome.trim() },
    });
  }

  async modelosSimilares(estabelecimentoId: string, fabricanteId?: string) {
    const modelos = await this.prisma.modelo.findMany({
      where: {
        ativo: true,
        fabricante: { estabelecimentoId },
        ...(fabricanteId ? { fabricanteId } : {}),
      },
      include: {
        fabricante: { select: { id: true, nome: true } },
        equipamentos: { select: { tag: true }, orderBy: { tag: "asc" }, take: 6 },
        _count: { select: { equipamentos: true } },
      },
      orderBy: [{ fabricante: { nome: "asc" } }, { nome: "asc" }],
    });

    type Row = (typeof modelos)[number];
    const porFab = new Map<string, Row[]>();
    for (const m of modelos) {
      const list = porFab.get(m.fabricanteId) ?? [];
      list.push(m);
      porFab.set(m.fabricanteId, list);
    }

    const grupos: Array<{
      chave: string;
      fabricante: { id: string; nome: string };
      modelos: Array<{
        id: string;
        nome: string;
        equipamentos: number;
        tags: string[];
      }>;
    }> = [];

    for (const [, lista] of porFab) {
      for (const { chave, itens } of agruparSimilares(lista)) {
        grupos.push({
          chave,
          fabricante: itens[0].fabricante,
          modelos: itens
            .map((m) => ({
              id: m.id,
              nome: m.nome,
              equipamentos: m._count.equipamentos,
              tags: m.equipamentos.map((e) => e.tag),
            }))
            .sort((a, b) => b.equipamentos - a.equipamentos || a.nome.localeCompare(b.nome, "pt-BR")),
        });
      }
    }

    grupos.sort((a, b) => {
      const qa = a.modelos.reduce((s, m) => s + m.equipamentos, 0);
      const qb = b.modelos.reduce((s, m) => s + m.equipamentos, 0);
      return qb - qa || a.fabricante.nome.localeCompare(b.fabricante.nome, "pt-BR");
    });

    return { totalModelos: modelos.length, grupos };
  }

  async consolidarModelos(user: AuthUser, destinoId: string, origemIds: string[]) {
    this.assertEdit(user);
    const origens = [...new Set(origemIds.map((id) => id.trim()).filter((id) => id && id !== destinoId))];
    if (!origens.length) throw new BadRequestException("Informe ao menos um modelo de origem");

    const destino = await this.prisma.modelo.findFirst({
      where: {
        id: destinoId,
        ativo: true,
        fabricante: { estabelecimentoId: user.estabelecimentoId },
      },
      include: { fabricante: { select: { id: true, nome: true } } },
    });
    if (!destino) throw new NotFoundException("Modelo de destino não encontrado");

    const origemRows = await this.prisma.modelo.findMany({
      where: {
        id: { in: origens },
        fabricante: { estabelecimentoId: user.estabelecimentoId },
      },
      include: { _count: { select: { equipamentos: true } } },
    });
    if (origemRows.length !== origens.length) {
      throw new BadRequestException("Há modelo de origem inválido ou de outro estabelecimento");
    }
    if (origemRows.some((m) => m.fabricanteId !== destino.fabricanteId)) {
      throw new BadRequestException("Só é possível consolidar modelos do mesmo fabricante");
    }

    const resumo = await this.prisma.$transaction(async (tx) => {
      return this.aplicarMergeModelo(tx, user.estabelecimentoId, destino.id, origens);
    });

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "CONSOLIDAR_MODELOS",
        detalhe: `destino=${destino.nome} (${destino.id}) · origens=${origemRows.map((m) => m.nome).join(", ")} · eqs=${resumo.equipamentosMovidos}`,
      },
    });

    return {
      destino: { id: destino.id, nome: destino.nome, fabricante: destino.fabricante.nome },
      origens: origemRows.map((m) => ({ id: m.id, nome: m.nome, equipamentos: m._count.equipamentos })),
      ...resumo,
    };
  }

  async fabricantesSimilares(estabelecimentoId: string) {
    const fabricantes = await this.prisma.fabricante.findMany({
      where: { estabelecimentoId, ativo: true },
      include: { _count: { select: { equipamentos: true, modelos: true } } },
      orderBy: { nome: "asc" },
    });

    const grupos = agruparSimilares(fabricantes).map(({ chave, itens }) => ({
      chave,
      fabricantes: itens
        .map((f) => ({
          id: f.id,
          nome: f.nome,
          equipamentos: f._count.equipamentos,
          modelos: f._count.modelos,
        }))
        .sort((a, b) => b.equipamentos - a.equipamentos || a.nome.localeCompare(b.nome, "pt-BR")),
    }));

    grupos.sort((a, b) => {
      const qa = a.fabricantes.reduce((s, f) => s + f.equipamentos, 0);
      const qb = b.fabricantes.reduce((s, f) => s + f.equipamentos, 0);
      return qb - qa || a.fabricantes[0].nome.localeCompare(b.fabricantes[0].nome, "pt-BR");
    });

    return { totalFabricantes: fabricantes.length, grupos };
  }

  async consolidarFabricantes(user: AuthUser, destinoId: string, origemIds: string[]) {
    this.assertEdit(user);
    const origens = [...new Set(origemIds.map((id) => id.trim()).filter((id) => id && id !== destinoId))];
    if (!origens.length) throw new BadRequestException("Informe ao menos um fabricante de origem");

    const destino = await this.prisma.fabricante.findFirst({
      where: { id: destinoId, estabelecimentoId: user.estabelecimentoId, ativo: true },
    });
    if (!destino) throw new NotFoundException("Fabricante de destino não encontrado");

    const origemRows = await this.prisma.fabricante.findMany({
      where: { id: { in: origens }, estabelecimentoId: user.estabelecimentoId },
      include: { _count: { select: { equipamentos: true, modelos: true } } },
    });
    if (origemRows.length !== origens.length) {
      throw new BadRequestException("Há fabricante de origem inválido ou de outro estabelecimento");
    }

    const resumo = await this.prisma.$transaction(
      async (tx) => {
        const movidos = await tx.equipamento.updateMany({
          where: { estabelecimentoId: user.estabelecimentoId, fabricanteId: { in: origens } },
          data: { fabricanteId: destino.id },
        });

        const modelosOrigem = await tx.modelo.findMany({
          where: { fabricanteId: { in: origens } },
        });
        let destModelos = await tx.modelo.findMany({
          where: { fabricanteId: destino.id },
        });

        let modelosMesclados = 0;
        let modelosMovidos = 0;
        for (const m of modelosOrigem) {
          const chave = chaveModelo(m.nome);
          const match = destModelos.find(
            (d) =>
              d.id !== m.id &&
              (d.nome === m.nome || (Boolean(chave) && chaveModelo(d.nome) === chave)),
          );
          if (match) {
            await this.aplicarMergeModelo(tx, user.estabelecimentoId, match.id, [m.id]);
            if (!match.ativo) {
              await tx.modelo.update({ where: { id: match.id }, data: { ativo: true } });
              match.ativo = true;
            }
            modelosMesclados += 1;
          } else {
            try {
              await tx.modelo.update({ where: { id: m.id }, data: { fabricanteId: destino.id } });
              destModelos = destModelos.concat({ ...m, fabricanteId: destino.id });
              modelosMovidos += 1;
            } catch (e) {
              if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
                const conflito = await tx.modelo.findFirst({
                  where: { fabricanteId: destino.id, nome: m.nome },
                });
                if (!conflito) throw e;
                await this.aplicarMergeModelo(tx, user.estabelecimentoId, conflito.id, [m.id]);
                modelosMesclados += 1;
              } else {
                throw e;
              }
            }
          }
        }

        const links = await tx.fornecedorFabricante.findMany({
          where: { fabricanteId: { in: origens } },
        });
        for (const l of links) {
          const jaTem = await tx.fornecedorFabricante.findUnique({
            where: {
              fornecedorId_fabricanteId: { fornecedorId: l.fornecedorId, fabricanteId: destino.id },
            },
          });
          if (jaTem) await tx.fornecedorFabricante.delete({ where: { id: l.id } });
          else await tx.fornecedorFabricante.update({ where: { id: l.id }, data: { fabricanteId: destino.id } });
        }

        await tx.fabricante.updateMany({
          where: { id: { in: origens } },
          data: { ativo: false },
        });

        return {
          equipamentosMovidos: movidos.count,
          fabricantesDesativados: origens.length,
          modelosMesclados,
          modelosMovidos,
        };
      },
      { timeout: 30000 },
    );

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "CONSOLIDAR_FABRICANTES",
        detalhe: `destino=${destino.nome} (${destino.id}) · origens=${origemRows.map((f) => f.nome).join(", ")} · eqs=${resumo.equipamentosMovidos}`,
      },
    });

    return {
      destino: { id: destino.id, nome: destino.nome },
      origens: origemRows.map((f) => ({
        id: f.id,
        nome: f.nome,
        equipamentos: f._count.equipamentos,
        modelos: f._count.modelos,
      })),
      ...resumo,
    };
  }

  private async aplicarMergeModelo(
    tx: Prisma.TransactionClient,
    estabelecimentoId: string,
    destinoId: string,
    origens: string[],
  ) {
    const destino = await tx.modelo.findUnique({ where: { id: destinoId } });
    if (!destino) throw new NotFoundException("Modelo de destino não encontrado");

    const movidos = await tx.equipamento.updateMany({
      where: { estabelecimentoId, modeloId: { in: origens } },
      data: { modeloId: destino.id, fabricanteId: destino.fabricanteId },
    });

    const procLinks = await tx.procedimentoModelo.findMany({ where: { modeloId: { in: origens } } });
    for (const link of procLinks) {
      const jaTem = await tx.procedimentoModelo.findUnique({
        where: { procedimentoId_modeloId: { procedimentoId: link.procedimentoId, modeloId: destino.id } },
      });
      if (jaTem) await tx.procedimentoModelo.delete({ where: { id: link.id } });
      else await tx.procedimentoModelo.update({ where: { id: link.id }, data: { modeloId: destino.id } });
    }

    const comps = await tx.estoqueCompatibilidade.findMany({ where: { modeloId: { in: origens } } });
    for (const c of comps) {
      const jaTem = await tx.estoqueCompatibilidade.findFirst({
        where: { estoqueItemId: c.estoqueItemId, modeloId: destino.id },
      });
      if (jaTem) await tx.estoqueCompatibilidade.delete({ where: { id: c.id } });
      else await tx.estoqueCompatibilidade.update({ where: { id: c.id }, data: { modeloId: destino.id } });
    }

    const docs = await tx.documentoVinculo.findMany({ where: { modeloId: { in: origens } } });
    for (const d of docs) {
      const jaTem = await tx.documentoVinculo.findFirst({
        where: { documentoId: d.documentoId, modeloId: destino.id, tipo: d.tipo },
      });
      if (jaTem) await tx.documentoVinculo.delete({ where: { id: d.id } });
      else await tx.documentoVinculo.update({ where: { id: d.id }, data: { modeloId: destino.id } });
    }

    await tx.planoInstancia.updateMany({
      where: { estabelecimentoId, modeloOrigemId: { in: origens } },
      data: { modeloOrigemId: destino.id },
    });

    await tx.modelo.updateMany({
      where: { id: { in: origens } },
      data: { ativo: false },
    });

    return {
      equipamentosMovidos: movidos.count,
      modelosDesativados: origens.length,
    };
  }

  setores(estabelecimentoId: string, q?: string) {
    return this.prisma.setor.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nome: "asc" },
    });
  }

  async createSetor(user: AuthUser, nome: string) {
    this.assertEdit(user);
    return this.prisma.setor.create({
      data: { estabelecimentoId: user.estabelecimentoId, nome: nome.trim() },
    });
  }

  fornecedores(estabelecimentoId: string, q?: string) {
    return this.prisma.fornecedor.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nome: "asc" },
      take: 100,
    });
  }

  async createFornecedor(user: AuthUser, nome: string, cnpj?: string) {
    this.assertEdit(user);
    return this.prisma.fornecedor.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: nome.trim(),
        cnpj: cnpj?.trim() || null,
      },
    });
  }

  planosDescricao(estabelecimentoId: string, q?: string) {
    return this.prisma.planoDescricao.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      include: { _count: { select: { equipamentos: true } } },
      orderBy: { nome: "asc" },
    });
  }

  async createPlano(
    user: AuthUser,
    data: {
      nome: string;
      criticidade?: Criticidade;
      vidaUtilAnos?: number;
      slaAtendimentoHoras?: number | null;
      slaConclusaoHoras?: number | null;
    },
  ) {
    this.assertEdit(user);
    return this.prisma.planoDescricao.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        criticidade: data.criticidade ?? Criticidade.MEDIA,
        vidaUtilAnos: data.vidaUtilAnos ?? 10,
        slaAtendimentoHoras: data.slaAtendimentoHoras || null,
        slaConclusaoHoras: data.slaConclusaoHoras || null,
      },
    });
  }

  async updatePlano(
    user: AuthUser,
    id: string,
    data: {
      nome?: string;
      criticidade?: Criticidade;
      vidaUtilAnos?: number;
      slaAtendimentoHoras?: number | null;
      slaConclusaoHoras?: number | null;
    },
  ) {
    this.assertEdit(user);
    const plano = await this.prisma.planoDescricao.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!plano) throw new NotFoundException();
    return this.prisma.planoDescricao.update({
      where: { id },
      data: {
        ...(data.nome ? { nome: data.nome.trim() } : {}),
        ...(data.criticidade ? { criticidade: data.criticidade } : {}),
        ...(data.vidaUtilAnos != null ? { vidaUtilAnos: data.vidaUtilAnos } : {}),
        ...(data.slaAtendimentoHoras !== undefined
          ? { slaAtendimentoHoras: data.slaAtendimentoHoras || null }
          : {}),
        ...(data.slaConclusaoHoras !== undefined
          ? { slaConclusaoHoras: data.slaConclusaoHoras || null }
          : {}),
      },
    });
  }

  centrosCusto(estabelecimentoId: string) {
    return this.prisma.centroCusto.findMany({
      where: { estabelecimentoId, ativo: true },
      orderBy: { codigo: "asc" },
    });
  }

  async colaboradores(estabelecimentoId: string, q?: string) {
    const rows = await listarResponsaveisAtribuiveis(this.prisma, estabelecimentoId);
    const term = q?.trim().toLowerCase();
    const filtered = term
      ? rows.filter(
          (c) =>
            c.nome.toLowerCase().includes(term) ||
            c.matricula.toLowerCase().includes(term) ||
            (c.funcao ?? "").toLowerCase().includes(term),
        )
      : rows;
    return filtered.slice(0, 100);
  }
}
