import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { OS_DOMINIO_PADROES, OS_DOMINIO_TIPOS, ehOsDominioTipo, type OsDominioTipo } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OsDominiosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(estabelecimentoId: string, tipo?: string) {
    await this.garantirPadroes(estabelecimentoId);
    if (tipo && !ehOsDominioTipo(tipo)) {
      throw new BadRequestException("Tipo de domínio inválido");
    }
    return this.prisma.osDominioValor.findMany({
      where: {
        estabelecimentoId,
        ...(tipo ? { tipo } : {}),
      },
      orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { nome: "asc" }],
    });
  }

  async criar(
    estabelecimentoId: string,
    data: { tipo: string; nome: string; codigo?: string | null; ordem?: number },
  ) {
    if (!ehOsDominioTipo(data.tipo)) throw new BadRequestException("Tipo de domínio inválido");
    const nome = data.nome.trim();
    if (nome.length < 2) throw new BadRequestException("Informe o nome (mín. 2 caracteres)");
    const max = await this.prisma.osDominioValor.aggregate({
      where: { estabelecimentoId, tipo: data.tipo },
      _max: { ordem: true },
    });
    try {
      return await this.prisma.osDominioValor.create({
        data: {
          estabelecimentoId,
          tipo: data.tipo,
          nome,
          codigo: data.codigo?.trim() || null,
          ordem: data.ordem ?? (max._max.ordem ?? -1) + 1,
        },
      });
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  async atualizar(
    estabelecimentoId: string,
    id: string,
    data: { nome?: string; codigo?: string | null; ativo?: boolean; ordem?: number },
  ) {
    const atual = await this.prisma.osDominioValor.findFirst({ where: { id, estabelecimentoId } });
    if (!atual) throw new NotFoundException("Valor de domínio não encontrado");
    const nome = data.nome !== undefined ? data.nome.trim() : atual.nome;
    if (nome.length < 2) throw new BadRequestException("Informe o nome (mín. 2 caracteres)");
    try {
      return await this.prisma.osDominioValor.update({
        where: { id: atual.id },
        data: {
          nome,
          codigo: data.codigo !== undefined ? data.codigo?.trim() || null : atual.codigo,
          ativo: data.ativo ?? atual.ativo,
          ordem: data.ordem ?? atual.ordem,
        },
      });
    } catch (e) {
      this.rethrowUnique(e);
    }
  }

  private async garantirPadroes(estabelecimentoId: string) {
    const existentes = await this.prisma.osDominioValor.findMany({
      where: { estabelecimentoId },
      distinct: ["tipo"],
      select: { tipo: true },
    });
    const tem = new Set(existentes.map((e) => e.tipo));
    const rows: Array<{
      estabelecimentoId: string;
      tipo: OsDominioTipo;
      codigo: string | null;
      nome: string;
      ordem: number;
    }> = [];
    for (const tipo of OS_DOMINIO_TIPOS) {
      if (tem.has(tipo)) continue;
      OS_DOMINIO_PADROES[tipo].forEach((p, i) => {
        rows.push({
          estabelecimentoId,
          tipo,
          codigo: p.codigo ?? null,
          nome: p.nome,
          ordem: i,
        });
      });
    }
    if (!rows.length) return;
    await this.prisma.osDominioValor.createMany({ data: rows, skipDuplicates: true });
  }

  private rethrowUnique(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ConflictException("Já existe um valor com este nome neste domínio");
    }
    throw e;
  }
}
