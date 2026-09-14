import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  NaturezaCustoOS,
  OrigemMaterialOS,
  Prisma,
  TipoItemOS,
  TipoMovimentoEstoque,
} from "@prisma/client";
import {
  ajusteExigeMotivo,
  conflitoOrcamentoViradoServico,
  conflitoPecaComoServico,
  custoMedioPonderado,
  exigeDestinoFisicoParaDevolver,
  LABEL_METODO_VALORIZACAO,
  METODO_VALORIZACAO_ESTOQUE,
  podeEditarModulo,
  podeVerFinanceiro,
  qtdNovaBaixa,
  resolverValorHoraMaoDeObra,
  round2,
  somarCustoRealizado,
  type DestinoFisicoDevolucao,
  type NaturezaCustoOS as NaturezaCustoShared,
  type TipoItemOSCusto,
} from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

type Tx = Prisma.TransactionClient;

@Injectable()
export class EstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  metodoValorizacao() {
    return {
      metodo: METODO_VALORIZACAO_ESTOQUE,
      descricao: LABEL_METODO_VALORIZACAO,
    };
  }

  async list(
    estabelecimentoId: string,
    opts: {
      q?: string;
      page?: number;
      pageSize?: number;
      almoxarifado?: string;
      abaixoMinimo?: boolean;
      incluirInativos?: boolean;
      equipamentoTag?: string;
    } = {},
  ) {
    const safePage = Math.max(1, opts.page ?? 1);
    const safeSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
    let equipamento: { id: string; modeloId: string } | null = null;
    if (opts.equipamentoTag?.trim()) {
      equipamento = await this.prisma.equipamento.findUnique({
        where: {
          estabelecimentoId_tag: { estabelecimentoId, tag: opts.equipamentoTag.trim() },
        },
        select: { id: true, modeloId: true },
      });
    }

    const where: Prisma.EstoqueItemWhereInput = {
      estabelecimentoId,
      ...(opts.incluirInativos ? {} : { ativo: true }),
      ...(opts.almoxarifado?.trim() ? { almoxarifado: opts.almoxarifado.trim() } : {}),
      ...(opts.q
        ? {
            OR: [
              { codigo: { contains: opts.q, mode: "insensitive" } },
              { descricao: { contains: opts.q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(equipamento
        ? {
            OR: [
              { compatibilidades: { none: {} } },
              { compatibilidades: { some: { modeloId: equipamento.modeloId } } },
              { compatibilidades: { some: { equipamentoId: equipamento.id } } },
            ],
          }
        : {}),
    };

    const [totalAll, items] = await Promise.all([
      this.prisma.estoqueItem.count({ where }),
      this.prisma.estoqueItem.findMany({
        where,
        include: {
          compatibilidades: {
            include: {
              modelo: { select: { id: true, nome: true } },
              equipamento: { select: { id: true, tag: true, nome: true } },
            },
          },
        },
        orderBy: { codigo: "asc" },
        skip: (safePage - 1) * safeSize,
        take: safeSize,
      }),
    ]);

    const ids = items.map((i) => i.id);
    const reservas =
      ids.length === 0
        ? []
        : await this.prisma.estoqueReserva.groupBy({
            by: ["estoqueItemId"],
            where: { estoqueItemId: { in: ids }, ativa: true },
            _sum: { quantidade: true },
          });
    const reservaMap = new Map(reservas.map((r) => [r.estoqueItemId, Number(r._sum.quantidade ?? 0)]));

    let mapped = items.map((item) => this.mapItem(item, reservaMap.get(item.id) ?? 0));
    if (opts.abaixoMinimo) mapped = mapped.filter((i) => i.status === "ABAIXO_DO_MINIMO");

    return {
      items: mapped,
      total: opts.abaixoMinimo ? mapped.length : totalAll,
      page: safePage,
      pageSize: safeSize,
      metodoValorizacao: METODO_VALORIZACAO_ESTOQUE,
    };
  }

  async getByCodigo(estabelecimentoId: string, codigo: string) {
    const item = await this.prisma.estoqueItem.findUnique({
      where: { estabelecimentoId_codigo: { estabelecimentoId, codigo } },
      include: {
        compatibilidades: {
          include: {
            modelo: { select: { id: true, nome: true } },
            equipamento: { select: { id: true, tag: true, nome: true } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException("Item de estoque não encontrado");
    const reservas = await this.prisma.estoqueReserva.aggregate({
      where: { estoqueItemId: item.id, ativa: true },
      _sum: { quantidade: true },
    });
    return this.mapItem(item, Number(reservas._sum.quantidade ?? 0));
  }

  async movimentos(
    estabelecimentoId: string,
    filtros: { itemCodigo?: string; tipo?: TipoMovimentoEstoque; osNumero?: number; almoxarifado?: string } = {},
  ) {
    const list = await this.prisma.estoqueMovimento.findMany({
      where: {
        estabelecimentoId,
        ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
        ...(filtros.osNumero ? { osNumero: filtros.osNumero } : {}),
        ...(filtros.itemCodigo
          ? { estoqueItem: { codigo: { equals: filtros.itemCodigo, mode: "insensitive" } } }
          : {}),
        ...(filtros.almoxarifado
          ? { estoqueItem: { almoxarifado: { equals: filtros.almoxarifado, mode: "insensitive" } } }
          : {}),
      },
      include: { estoqueItem: { select: { codigo: true, descricao: true, unidade: true, almoxarifado: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    const userIds = [...new Set(list.map((m) => m.usuarioId).filter((id): id is string => Boolean(id)))];
    const users = userIds.length
      ? await this.prisma.usuario.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u.nome]));
    return list.map((m) => ({
      ...m,
      quantidade: Number(m.quantidade),
      custoUnitario: m.custoUnitario != null ? Number(m.custoUnitario) : null,
      saldoApos: m.saldoApos != null ? Number(m.saldoApos) : null,
      autorNome: m.usuarioId ? (byId.get(m.usuarioId) ?? null) : null,
    }));
  }

  async create(
    user: AuthUser,
    data: {
      codigo: string;
      descricao: string;
      unidade?: string;
      almoxarifado?: string;
      qtdAtual?: number;
      qtdMinima?: number;
      valorUnitario?: number;
      controlaLote?: boolean;
      lote?: string;
      numeroSerie?: string;
      validade?: string;
      modeloIds?: string[];
      equipamentoTags?: string[];
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    const qtd = Number(data.qtdAtual ?? 0);
    if (qtd < 0) throw new BadRequestException("Quantidade inicial não pode ser negativa");
    const custo = Number(data.valorUnitario ?? 0);

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.estoqueItem.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          codigo: data.codigo.trim(),
          descricao: data.descricao.trim(),
          unidade: data.unidade?.trim() || "UN",
          almoxarifado: data.almoxarifado?.trim() || "Principal",
          qtdAtual: qtd,
          qtdMinima: data.qtdMinima ?? 0,
          valorUnitario: custo,
          controlaLote: Boolean(data.controlaLote),
          lote: data.controlaLote ? data.lote?.trim() || null : null,
          numeroSerie: data.controlaLote ? data.numeroSerie?.trim() || null : null,
          validade: data.controlaLote && data.validade ? new Date(data.validade) : null,
        },
      });
      await this.salvarCompat(tx, item.id, user.estabelecimentoId, data.modeloIds, data.equipamentoTags);
      if (qtd > 0) {
        await tx.estoqueMovimento.create({
          data: {
            estabelecimentoId: user.estabelecimentoId,
            estoqueItemId: item.id,
            tipo: TipoMovimentoEstoque.ENTRADA,
            quantidade: qtd,
            motivo: "Saldo inicial",
            usuarioId: user.userId,
            custoUnitario: custo,
            saldoApos: qtd,
            documento: "SALDO_INICIAL",
          },
        });
      }
      return item;
    });
  }

  async updateCatalogo(
    user: AuthUser,
    codigo: string,
    data: {
      descricao?: string;
      unidade?: string;
      almoxarifado?: string;
      qtdMinima?: number;
      controlaLote?: boolean;
      lote?: string;
      numeroSerie?: string;
      validade?: string | null;
      modeloIds?: string[];
      equipamentoTags?: string[];
      qtdAtual?: number;
      valorUnitario?: number;
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    if (data.qtdAtual != null) {
      throw new BadRequestException("Saldo não é editável direto. Use entrada, ajuste ou estorno.");
    }
    if (data.valorUnitario != null) {
      throw new BadRequestException("Custo médio não é editável direto. Ele muda nas entradas pelo custo do movimento.");
    }
    const item = await this.findItem(user.estabelecimentoId, codigo);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.estoqueItem.update({
        where: { id: item.id },
        data: {
          descricao: data.descricao?.trim() ?? undefined,
          unidade: data.unidade?.trim() || undefined,
          almoxarifado: data.almoxarifado?.trim() || undefined,
          qtdMinima: data.qtdMinima,
          controlaLote: data.controlaLote,
          lote: data.controlaLote === false ? null : data.lote?.trim() ?? undefined,
          numeroSerie: data.controlaLote === false ? null : data.numeroSerie?.trim() ?? undefined,
          validade:
            data.controlaLote === false ? null : data.validade === undefined ? undefined : data.validade ? new Date(data.validade) : null,
        },
      });
      if (data.modeloIds || data.equipamentoTags) {
        await tx.estoqueCompatibilidade.deleteMany({ where: { estoqueItemId: item.id } });
        await this.salvarCompat(tx, item.id, user.estabelecimentoId, data.modeloIds, data.equipamentoTags);
      }
      return updated;
    });
  }

  async setAtivo(user: AuthUser, codigo: string, ativo: boolean, motivo?: string) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    const item = await this.findItem(user.estabelecimentoId, codigo);
    return this.prisma.estoqueItem.update({
      where: { id: item.id },
      data: ativo
        ? { ativo: true, inativadoEm: null, inativadoMotivo: null }
        : { ativo: false, inativadoEm: new Date(), inativadoMotivo: motivo?.trim() || "Inativado sem apagar histórico" },
    });
  }

  async entrada(
    user: AuthUser,
    data: {
      itemCodigo: string;
      qtd: number;
      motivo?: string;
      custoUnitario?: number;
      documento?: string;
      origem?: string;
      destino?: string;
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    if (data.qtd <= 0) throw new BadRequestException("Quantidade inválida");
    const item = await this.findItem(user.estabelecimentoId, data.itemCodigo);
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockItem(tx, item.id);
      const custoMov = data.custoUnitario != null && data.custoUnitario >= 0 ? data.custoUnitario : Number(locked.valorUnitario);
      const novoMedio = custoMedioPonderado(Number(locked.qtdAtual), Number(locked.valorUnitario), data.qtd, custoMov);
      const updated = await tx.estoqueItem.update({
        where: { id: item.id },
        data: { qtdAtual: { increment: data.qtd }, valorUnitario: novoMedio },
      });
      await tx.estoqueMovimento.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          estoqueItemId: item.id,
          tipo: TipoMovimentoEstoque.ENTRADA,
          quantidade: data.qtd,
          motivo: data.motivo?.trim() || "Entrada",
          usuarioId: user.userId,
          custoUnitario: custoMov,
          documento: data.documento?.trim() || null,
          origem: data.origem?.trim() || null,
          destino: data.destino?.trim() || updated.almoxarifado,
          saldoApos: Number(updated.qtdAtual),
        },
      });
      return updated;
    });
  }

  async baixar(
    user: AuthUser,
    itemCodigo: string,
    qtd: number,
    osNumero: number,
    opts: { chaveIdempotencia?: string; documento?: string } = {},
  ) {
    if (!(qtd > 0)) throw new BadRequestException("Quantidade inválida");
    const item = await this.findItem(user.estabelecimentoId, itemCodigo);
    const os = await this.findOs(user.estabelecimentoId, osNumero);
    if (opts.chaveIdempotencia) {
      const existente = await this.prisma.estoqueMovimento.findFirst({
        where: { estabelecimentoId: user.estabelecimentoId, chaveIdempotencia: opts.chaveIdempotencia },
      });
      if (existente) return { idempotente: true, movimento: existente };
    }

    return this.prisma.$transaction(async (tx) => {
      return this.baixarNoTx(tx, user, item.id, qtd, os, opts);
    });
  }

  async baixarNoTx(
    tx: Tx,
    user: AuthUser,
    estoqueItemId: string,
    qtd: number,
    os: { id: string; numero: number },
    opts: { chaveIdempotencia?: string; documento?: string } = {},
  ) {
    const locked = await this.lockItem(tx, estoqueItemId);
    const ja = await tx.estoqueMovimento.aggregate({
      where: {
        estoqueItemId,
        osNumero: os.numero,
        tipo: TipoMovimentoEstoque.BAIXA,
        estornaMovimentoId: null,
      },
      _sum: { quantidade: true },
    });
    const estornos = await tx.estoqueMovimento.aggregate({
      where: {
        estoqueItemId,
        osNumero: os.numero,
        tipo: { in: [TipoMovimentoEstoque.ESTORNO, TipoMovimentoEstoque.DEVOLUCAO] },
      },
      _sum: { quantidade: true },
    });
    const jaBaixado = Number(ja._sum.quantidade ?? 0) - Number(estornos._sum.quantidade ?? 0);
    const qtdNova = qtdNovaBaixa(qtd, jaBaixado);
    if (qtdNova <= 0) {
      return { idempotente: true, qtdNova: 0, qtdAtual: Number(locked.qtdAtual) };
    }

    const reservas = await tx.estoqueReserva.findMany({
      where: { ordemServicoId: os.id, estoqueItemId, ativa: true },
      orderBy: { createdAt: "asc" },
    });
    let restanteReserva = qtdNova;
    for (const r of reservas) {
      const usar = Math.min(Number(r.quantidade), restanteReserva);
      const sobra = Number(r.quantidade) - usar;
      await tx.estoqueReserva.update({
        where: { id: r.id },
        data: sobra > 1e-9 ? { quantidade: sobra } : { quantidade: 0, ativa: false },
      });
      restanteReserva = round2(restanteReserva - usar);
      if (restanteReserva <= 0) break;
    }

    if (Number(locked.qtdAtual) + 1e-9 < qtdNova) {
      throw new ConflictException("Saldo insuficiente — estoque não pode ficar negativo");
    }

    const custoHist = Number(locked.valorUnitario);
    const updated = await tx.estoqueItem.update({
      where: { id: estoqueItemId },
      data: { qtdAtual: { decrement: qtdNova } },
    });

    const itemOs = await this.upsertItemOsRealizado(tx, os.id, {
      estoqueItemId,
      descricao: locked.descricao,
      quantidade: qtdNova,
      valorUnitario: custoHist,
      origem: OrigemMaterialOS.ESTOQUE,
    });

    const mov = await tx.estoqueMovimento.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        estoqueItemId,
        tipo: TipoMovimentoEstoque.BAIXA,
        quantidade: qtdNova,
        motivo: `Baixa OS-${os.numero}`,
        osNumero: os.numero,
        usuarioId: user.userId,
        custoUnitario: custoHist,
        documento: opts.documento?.trim() || `OS-${os.numero}`,
        origem: locked.almoxarifado,
        destino: `OS-${os.numero}`,
        chaveIdempotencia: opts.chaveIdempotencia || null,
        saldoApos: Number(updated.qtdAtual),
      },
    });
    return { idempotente: false, movimento: mov, itemOs, qtdNova, qtdAtual: Number(updated.qtdAtual) };
  }

  async reservarPecasTx(
    tx: Tx,
    user: AuthUser,
    os: { id: string; numero: number },
    pecas: Array<{ itemCodigo: string; qtd: number }>,
  ) {
    for (const peca of pecas) {
      if (!(peca.qtd > 0)) throw new BadRequestException("Quantidade de peça inválida");
      const item = await tx.estoqueItem.findUnique({
        where: {
          estabelecimentoId_codigo: { estabelecimentoId: user.estabelecimentoId, codigo: peca.itemCodigo },
        },
      });
      if (!item) throw new NotFoundException(`Peça ${peca.itemCodigo} não encontrada no estoque`);
      if (!item.ativo) throw new BadRequestException(`Peça ${peca.itemCodigo} está inativa`);
      const locked = await this.lockItem(tx, item.id);
      const reservas = await tx.estoqueReserva.aggregate({
        where: { estoqueItemId: item.id, ativa: true },
        _sum: { quantidade: true },
      });
      const disponivel = Number(locked.qtdAtual) - Number(reservas._sum.quantidade ?? 0);
      if (disponivel + 1e-9 < peca.qtd) {
        throw new ConflictException(`Saldo disponível insuficiente para ${peca.itemCodigo}`);
      }
      await tx.ordemServicoItem.create({
        data: {
          ordemServicoId: os.id,
          tipo: TipoItemOS.MATERIAL,
          descricao: item.descricao,
          quantidade: peca.qtd,
          valorUnitario: Number(locked.valorUnitario),
          estoqueItemId: item.id,
          origemMaterial: OrigemMaterialOS.ESTOQUE,
          naturezaCusto: NaturezaCustoOS.ESTIMADO,
        },
      });
      await tx.estoqueReserva.create({
        data: { estoqueItemId: item.id, ordemServicoId: os.id, quantidade: peca.qtd, ativa: true },
      });
      await tx.estoqueMovimento.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          estoqueItemId: item.id,
          tipo: TipoMovimentoEstoque.RESERVA,
          quantidade: peca.qtd,
          motivo: `Reserva OS-${os.numero}`,
          osNumero: os.numero,
          usuarioId: user.userId,
          custoUnitario: Number(locked.valorUnitario),
          saldoApos: Number(locked.qtdAtual),
        },
      });
    }
  }

  async consumirReservasTx(tx: Tx, user: AuthUser, os: { id: string; numero: number }) {
    const reservas = await tx.estoqueReserva.findMany({
      where: { ordemServicoId: os.id, ativa: true },
    });
    for (const r of reservas) {
      await this.baixarNoTx(tx, user, r.estoqueItemId, Number(r.quantidade), os, {
        documento: `FECHAMENTO-OS-${os.numero}`,
      });
    }
  }

  async aoCancelarOuReabrirTx(
    tx: Tx,
    user: AuthUser,
    os: { id: string; numero: number },
    acao: "cancelar" | "reabrir",
    destinoFisico?: DestinoFisicoDevolucao | null,
  ) {
    await tx.estoqueReserva.updateMany({
      where: { ordemServicoId: os.id, ativa: true },
      data: { ativa: false },
    });

    const baixas = await tx.estoqueMovimento.findMany({
      where: { estabelecimentoId: user.estabelecimentoId, osNumero: os.numero, tipo: TipoMovimentoEstoque.BAIXA },
    });
    const devolucoes = await tx.estoqueMovimento.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        osNumero: os.numero,
        tipo: { in: [TipoMovimentoEstoque.DEVOLUCAO, TipoMovimentoEstoque.ESTORNO] },
      },
    });
    const qtdBaixa = baixas.reduce((s, m) => s + Number(m.quantidade), 0);
    const qtdDev = devolucoes.reduce((s, m) => s + Number(m.quantidade), 0);
    const pendente = qtdBaixa - qtdDev;
    const dest = exigeDestinoFisicoParaDevolver({ acao, qtdBaixadaNaoEstornada: pendente, destinoFisico });
    if (!dest.ok) throw new BadRequestException(dest.erro);
    if (dest.devolveAoEstoque) {
      const jaDevPorOrigem = new Map<string, number>();
      for (const d of devolucoes) {
        if (d.estornaMovimentoId) {
          jaDevPorOrigem.set(d.estornaMovimentoId, (jaDevPorOrigem.get(d.estornaMovimentoId) ?? 0) + Number(d.quantidade));
        }
      }
      for (const b of baixas) {
        const rest = Number(b.quantidade) - (jaDevPorOrigem.get(b.id) ?? 0);
        if (rest > 1e-9) {
          await this.devolverNoTx(tx, user, b.id, rest, `Destino físico confirmado na ${acao} da OS-${os.numero}`);
        }
      }
    }
    return { reservasLiberadas: true, materialDevolvido: dest.devolveAoEstoque, qtdPendente: pendente };
  }

  async devolucao(user: AuthUser, movimentoId: string, qtd?: number, motivo?: string) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => this.devolverNoTx(tx, user, movimentoId, qtd, motivo));
  }

  async ajuste(
    user: AuthUser,
    data: {
      itemCodigo: string;
      qtd: number;
      motivo: string;
      documento?: string;
      custoUnitario?: number;
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    const mot = ajusteExigeMotivo(data.motivo);
    if (!mot.ok) throw new BadRequestException(mot.erro);
    if (data.qtd === 0) throw new BadRequestException("Quantidade inválida");
    const item = await this.findItem(user.estabelecimentoId, data.itemCodigo);
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.lockItem(tx, item.id);
      const delta = data.qtd;
      const proximo = Number(locked.qtdAtual) + delta;
      if (proximo < -1e-9) throw new ConflictException("Saldo insuficiente — estoque não pode ficar negativo");
      let valorUnitario = Number(locked.valorUnitario);
      if (delta > 0 && data.custoUnitario != null) {
        valorUnitario = custoMedioPonderado(Number(locked.qtdAtual), valorUnitario, delta, data.custoUnitario);
      }
      const updated = await tx.estoqueItem.update({
        where: { id: item.id },
        data: { qtdAtual: proximo, valorUnitario },
      });
      await tx.estoqueMovimento.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          estoqueItemId: item.id,
          tipo: TipoMovimentoEstoque.AJUSTE,
          quantidade: Math.abs(delta),
          motivo: data.motivo.trim(),
          usuarioId: user.userId,
          custoUnitario: data.custoUnitario ?? Number(locked.valorUnitario),
          documento: data.documento?.trim() || null,
          origem: delta < 0 ? locked.almoxarifado : "AJUSTE",
          destino: delta > 0 ? locked.almoxarifado : "AJUSTE",
          saldoApos: Number(updated.qtdAtual),
        },
      });
      return updated;
    });
  }

  async estorno(user: AuthUser, movimentoId: string, motivo?: string) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const orig = await tx.estoqueMovimento.findFirst({
        where: { id: movimentoId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!orig) throw new NotFoundException("Movimento não encontrado");
      if (orig.tipo === TipoMovimentoEstoque.ESTORNO) {
        throw new BadRequestException("Não é possível estornar um estorno");
      }
      const ja = await tx.estoqueMovimento.findFirst({
        where: { estornaMovimentoId: orig.id, tipo: TipoMovimentoEstoque.ESTORNO },
      });
      if (ja) throw new ConflictException("Este movimento já foi estornado");

      const locked = await this.lockItem(tx, orig.estoqueItemId);
      const qtd = Number(orig.quantidade);
      const custoHist = Number(orig.custoUnitario ?? locked.valorUnitario);
      let qtdAtual = Number(locked.qtdAtual);
      let medio = Number(locked.valorUnitario);

      if (orig.tipo === TipoMovimentoEstoque.ENTRADA) {
        if (qtdAtual + 1e-9 < qtd) throw new ConflictException("Saldo insuficiente para estornar a entrada");
        qtdAtual = round2(qtdAtual - qtd);
      } else if (
        orig.tipo === TipoMovimentoEstoque.BAIXA ||
        orig.tipo === TipoMovimentoEstoque.SAIDA ||
        (orig.tipo === TipoMovimentoEstoque.AJUSTE && orig.destino === "AJUSTE")
      ) {
        medio = custoMedioPonderado(qtdAtual, medio, qtd, custoHist);
        qtdAtual = round2(qtdAtual + qtd);
      } else if (orig.tipo === TipoMovimentoEstoque.DEVOLUCAO) {
        if (qtdAtual + 1e-9 < qtd) throw new ConflictException("Saldo insuficiente para estornar a devolução");
        qtdAtual = round2(qtdAtual - qtd);
      } else if (orig.tipo === TipoMovimentoEstoque.AJUSTE) {
        const positivo = orig.destino !== "AJUSTE" || orig.origem === "AJUSTE";
        if (positivo && orig.origem === "AJUSTE") {
          if (qtdAtual + 1e-9 < qtd) throw new ConflictException("Saldo insuficiente para estornar o ajuste");
          qtdAtual = round2(qtdAtual - qtd);
        } else {
          medio = custoMedioPonderado(qtdAtual, medio, qtd, custoHist);
          qtdAtual = round2(qtdAtual + qtd);
        }
      }

      const updated = await tx.estoqueItem.update({
        where: { id: orig.estoqueItemId },
        data: { qtdAtual, valorUnitario: medio },
      });

      if (orig.tipo === TipoMovimentoEstoque.BAIXA && orig.osNumero) {
        const os = await tx.ordemServico.findUnique({
          where: {
            estabelecimentoId_numero: { estabelecimentoId: user.estabelecimentoId, numero: orig.osNumero },
          },
        });
        if (os) {
          const itens = await tx.ordemServicoItem.findMany({
            where: { ordemServicoId: os.id, estoqueItemId: orig.estoqueItemId, estornado: false },
          });
          let rest = qtd;
          for (const it of itens) {
            if (rest <= 0) break;
            const q = Number(it.quantidade);
            if (q <= rest + 1e-9) {
              await tx.ordemServicoItem.update({ where: { id: it.id }, data: { estornado: true } });
              rest = round2(rest - q);
            } else {
              await tx.ordemServicoItem.update({
                where: { id: it.id },
                data: { quantidade: round2(q - rest) },
              });
              rest = 0;
            }
          }
        }
      }

      return tx.estoqueMovimento.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          estoqueItemId: orig.estoqueItemId,
          tipo: TipoMovimentoEstoque.ESTORNO,
          quantidade: qtd,
          motivo: motivo?.trim() || `Estorno de ${orig.tipo}`,
          osNumero: orig.osNumero,
          usuarioId: user.userId,
          custoUnitario: custoHist,
          estornaMovimentoId: orig.id,
          documento: orig.documento,
          saldoApos: Number(updated.qtdAtual),
        },
      });
    });
  }

  async reservar(user: AuthUser, itemCodigo: string, qtd: number, osNumero: number) {
    const os = await this.findOs(user.estabelecimentoId, osNumero);
    return this.prisma.$transaction(async (tx) => {
      await this.reservarPecasTx(tx, user, os, [{ itemCodigo, qtd }]);
      return { ok: true };
    });
  }

  async solicitarRepos(user: AuthUser, itemCodigo: string, qtd: number, observacao?: string) {
    if (qtd <= 0) throw new BadRequestException("Quantidade inválida");
    const item = await this.findItem(user.estabelecimentoId, itemCodigo);
    return this.prisma.estoqueMovimento.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        estoqueItemId: item.id,
        tipo: TipoMovimentoEstoque.REPOSICAO_SOLICITADA,
        quantidade: qtd,
        motivo: observacao?.trim() || "Solicitação de reposição",
        usuarioId: user.userId,
        destino: "INTERNO",
        saldoApos: Number(item.qtdAtual),
      },
      include: { estoqueItem: { select: { codigo: true, descricao: true, qtdAtual: true, qtdMinima: true } } },
    });
  }

  async lancarCustoOs(
    user: AuthUser,
    osNumero: number,
    data: {
      tipo: TipoItemOS;
      descricao: string;
      quantidade?: number;
      valorUnitario?: number;
      origemMaterial?: OrigemMaterialOS;
      naturezaCusto?: NaturezaCustoOS;
      itemCodigo?: string;
      qtd?: number;
    },
  ) {
    const os = await this.findOs(user.estabelecimentoId, osNumero);
    const existentes = await this.prisma.ordemServicoItem.findMany({ where: { ordemServicoId: os.id } });
    const tipo = data.tipo;
    const desc = data.descricao.trim();
    const peca = conflitoPecaComoServico({
      tipoNovo: tipo as TipoItemOSCusto,
      descricao: desc,
      estoqueItemId: undefined,
      existentes: existentes.map((e) => ({
        tipo: e.tipo,
        descricao: e.descricao,
        estoqueItemId: e.estoqueItemId,
        origemMaterial: e.origemMaterial,
        estornado: e.estornado,
      })),
    });
    if (!peca.ok) throw new BadRequestException(peca.erro);
    const orc = conflitoOrcamentoViradoServico({
      naturezaNova: (data.naturezaCusto ?? "REALIZADO") as NaturezaCustoShared,
      tipoNovo: tipo as TipoItemOSCusto,
      descricao: desc,
      existentes: existentes.map((e) => ({
        tipo: e.tipo,
        descricao: e.descricao,
        naturezaCusto: e.naturezaCusto,
        estornado: e.estornado,
      })),
    });
    if (!orc.ok) throw new BadRequestException(orc.erro);

    if (tipo === TipoItemOS.MATERIAL && data.origemMaterial === OrigemMaterialOS.ESTOQUE && data.itemCodigo) {
      return this.baixar(user, data.itemCodigo, data.qtd ?? data.quantidade ?? 1, osNumero);
    }

    let valor = data.valorUnitario ?? null;
    if (tipo === TipoItemOS.MAO_DE_OBRA) {
      const org = await this.prisma.estabelecimento.findUnique({
        where: { id: user.estabelecimentoId },
        select: { valorHoraMaoDeObra: true },
      });
      valor = resolverValorHoraMaoDeObra({
        valorHoraConfigurado: org?.valorHoraMaoDeObra != null ? Number(org.valorHoraMaoDeObra) : null,
        podeVerFinanceiro: podeVerFinanceiro(user.perfil, user.permissoesModulos),
      });
    } else if (valor != null && !podeVerFinanceiro(user.perfil, user.permissoesModulos)) {
      valor = null;
    }

    return this.prisma.ordemServicoItem.create({
      data: {
        ordemServicoId: os.id,
        tipo,
        descricao: desc,
        quantidade: data.quantidade ?? data.qtd ?? 1,
        valorUnitario: valor,
        origemMaterial: data.origemMaterial ?? (tipo === TipoItemOS.MATERIAL ? OrigemMaterialOS.COMPRA_DIRETA : null),
        naturezaCusto: data.naturezaCusto ?? NaturezaCustoOS.REALIZADO,
      },
    });
  }

  async custos(
    user: AuthUser,
    filtros: { osNumero?: number; equipamentoTag?: string } = {},
  ) {
    const ver = podeVerFinanceiro(user.perfil, user.permissoesModulos);
    const itens = await this.prisma.ordemServicoItem.findMany({
      where: {
        ordemServico: {
          estabelecimentoId: user.estabelecimentoId,
          ...(filtros.osNumero ? { numero: filtros.osNumero } : {}),
          ...(filtros.equipamentoTag ? { equipamento: { tag: filtros.equipamentoTag } } : {}),
        },
      },
      include: {
        ordemServico: { include: { equipamento: { select: { tag: true, nome: true } } } },
        estoqueItem: { select: { codigo: true } },
      },
    });
    const totais = somarCustoRealizado(
      itens.map((i) => ({
        tipo: i.tipo,
        quantidade: Number(i.quantidade),
        valorUnitario: i.valorUnitario != null ? Number(i.valorUnitario) : null,
        naturezaCusto: i.naturezaCusto,
        estornado: i.estornado,
      })),
    );
    const linhas = itens.map((i) => ({
      osNumero: i.ordemServico.numero,
      equipamentoTag: i.ordemServico.equipamento?.tag ?? null,
      tipo: i.tipo,
      descricao: i.descricao,
      quantidade: Number(i.quantidade),
      valorUnitario: ver ? (i.valorUnitario != null ? Number(i.valorUnitario) : null) : null,
      total: ver ? round2(Number(i.quantidade) * Number(i.valorUnitario ?? 0)) : null,
      origemMaterial: i.origemMaterial,
      naturezaCusto: i.naturezaCusto,
      estornado: i.estornado,
      pecaCodigo: i.estoqueItem?.codigo ?? null,
    }));
    return {
      metodoValorizacao: METODO_VALORIZACAO_ESTOQUE,
      descricaoMetodo: LABEL_METODO_VALORIZACAO,
      verValores: ver,
      totais: ver ? totais : { realizado: null, estimado: null, aprovado: null, porTipo: null },
      linhas,
    };
  }

  async exportCsv(user: AuthUser) {
    const { items } = await this.list(user.estabelecimentoId, { page: 1, pageSize: 100, incluirInativos: true });
    const ver = podeVerFinanceiro(user.perfil, user.permissoesModulos);
    const header = "codigo,descricao,unidade,localizacao,qtdAtual,qtdMinima,qtdReservada,disponivel,status,ativo,custoMedio";
    const lines = items.map((i) =>
      [
        i.codigo,
        `"${String(i.descricao).replace(/"/g, '""')}"`,
        i.unidade,
        i.almoxarifado,
        i.qtdAtual,
        i.qtdMinima,
        i.qtdReservada,
        i.disponivel,
        i.status,
        i.ativo ? "sim" : "nao",
        ver ? i.valorUnitario : "",
      ].join(","),
    );
    return [header, ...lines].join("\n");
  }

  async liberarReservasDaOs(ordemServicoId: string) {
    await this.prisma.estoqueReserva.updateMany({
      where: { ordemServicoId, ativa: true },
      data: { ativa: false },
    });
  }

  listComponentes(estabelecimentoId: string) {
    return this.prisma.componenteRecuperado.findMany({
      where: { estabelecimentoId },
      include: { equipamentoOrigem: true, equipamentoDestino: true },
      orderBy: { dataRetirada: "desc" },
    });
  }

  async createComponente(
    user: AuthUser,
    data: { itemDescricao: string; equipamentoOrigemTag: string; dataRetirada?: string },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    const origem = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag: data.equipamentoOrigemTag },
      },
    });
    if (!origem) throw new NotFoundException("Equipamento de origem não encontrado");
    return this.prisma.componenteRecuperado.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        itemDescricao: data.itemDescricao.trim(),
        equipamentoOrigemId: origem.id,
        dataRetirada: data.dataRetirada ? new Date(data.dataRetirada) : new Date(),
      },
      include: { equipamentoOrigem: true },
    });
  }

  async updateComponente(
    user: AuthUser,
    id: string,
    data: {
      situacao: "EM_RASTREAMENTO" | "REAPROVEITADO" | "DESCARTADO";
      equipamentoDestinoTag?: string;
      osDestinoNumero?: number;
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "estoque")) throw new ForbiddenException();
    const comp = await this.prisma.componenteRecuperado.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!comp) throw new NotFoundException();
    let destinoId: string | undefined;
    if (data.equipamentoDestinoTag) {
      const dest = await this.prisma.equipamento.findUnique({
        where: {
          estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag: data.equipamentoDestinoTag },
        },
      });
      if (!dest) throw new NotFoundException("Equipamento destino não encontrado");
      destinoId = dest.id;
    }
    return this.prisma.componenteRecuperado.update({
      where: { id },
      data: {
        situacao: data.situacao,
        equipamentoDestinoId: destinoId,
        osDestinoNumero: data.osDestinoNumero,
      },
      include: { equipamentoOrigem: true, equipamentoDestino: true },
    });
  }

  private mapItem(
    item: {
      id: string;
      codigo: string;
      descricao: string;
      unidade?: string;
      almoxarifado: string;
      qtdAtual: unknown;
      qtdMinima: unknown;
      valorUnitario: unknown;
      ativo: boolean;
      controlaLote?: boolean;
      lote?: string | null;
      numeroSerie?: string | null;
      validade?: Date | null;
      compatibilidades?: unknown;
    },
    qtdReservada: number,
  ) {
    const qtdAtual = Number(item.qtdAtual);
    const qtdMinima = Number(item.qtdMinima);
    return {
      ...item,
      unidade: item.unidade ?? "UN",
      qtdAtual,
      qtdMinima,
      valorUnitario: Number(item.valorUnitario),
      qtdReservada,
      disponivel: qtdAtual - qtdReservada,
      status: qtdAtual < qtdMinima ? "ABAIXO_DO_MINIMO" : "NORMAL",
    };
  }

  private async lockItem(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        descricao: string;
        almoxarifado: string;
        qtdAtual: unknown;
        valorUnitario: unknown;
      }>
    >`SELECT id, descricao, almoxarifado, "qtdAtual", "valorUnitario" FROM "EstoqueItem" WHERE id = ${id} FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundException("Item de estoque não encontrado");
    return row;
  }

  private async salvarCompat(
    tx: Tx,
    estoqueItemId: string,
    estabelecimentoId: string,
    modeloIds?: string[],
    equipamentoTags?: string[],
  ) {
    for (const modeloId of modeloIds ?? []) {
      await tx.estoqueCompatibilidade.create({ data: { estoqueItemId, modeloId } });
    }
    for (const tag of equipamentoTags ?? []) {
      const eq = await tx.equipamento.findUnique({
        where: { estabelecimentoId_tag: { estabelecimentoId, tag: tag.trim() } },
        select: { id: true },
      });
      if (eq) await tx.estoqueCompatibilidade.create({ data: { estoqueItemId, equipamentoId: eq.id } });
    }
  }

  private async upsertItemOsRealizado(
    tx: Tx,
    ordemServicoId: string,
    data: {
      estoqueItemId: string;
      descricao: string;
      quantidade: number;
      valorUnitario: number;
      origem: OrigemMaterialOS;
    },
  ) {
    const estimado = await tx.ordemServicoItem.findFirst({
      where: {
        ordemServicoId,
        estoqueItemId: data.estoqueItemId,
        naturezaCusto: NaturezaCustoOS.ESTIMADO,
        estornado: false,
      },
    });
    if (estimado) {
      return tx.ordemServicoItem.update({
        where: { id: estimado.id },
        data: {
          quantidade: data.quantidade,
          valorUnitario: data.valorUnitario,
          naturezaCusto: NaturezaCustoOS.REALIZADO,
          origemMaterial: data.origem,
        },
      });
    }
    const realizado = await tx.ordemServicoItem.findFirst({
      where: {
        ordemServicoId,
        estoqueItemId: data.estoqueItemId,
        naturezaCusto: NaturezaCustoOS.REALIZADO,
        estornado: false,
      },
    });
    if (realizado) {
      return tx.ordemServicoItem.update({
        where: { id: realizado.id },
        data: {
          quantidade: { increment: data.quantidade },
          valorUnitario: data.valorUnitario,
        },
      });
    }
    return tx.ordemServicoItem.create({
      data: {
        ordemServicoId,
        tipo: TipoItemOS.MATERIAL,
        descricao: data.descricao,
        quantidade: data.quantidade,
        valorUnitario: data.valorUnitario,
        estoqueItemId: data.estoqueItemId,
        origemMaterial: data.origem,
        naturezaCusto: NaturezaCustoOS.REALIZADO,
      },
    });
  }

  private async devolverNoTx(tx: Tx, user: AuthUser, movimentoId: string, qtd?: number, motivo?: string) {
    const orig = await tx.estoqueMovimento.findFirst({
      where: { id: movimentoId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!orig) throw new NotFoundException("Movimento não encontrado");
    if (orig.tipo !== TipoMovimentoEstoque.BAIXA) {
      throw new BadRequestException("Devolução só se aplica a baixa de consumo");
    }
    const qtdDev = qtd != null && qtd > 0 ? qtd : Number(orig.quantidade);
    if (qtdDev > Number(orig.quantidade) + 1e-9) {
      throw new BadRequestException("Quantidade devolvida maior que a baixa");
    }
    const locked = await this.lockItem(tx, orig.estoqueItemId);
    const custoHist = Number(orig.custoUnitario ?? locked.valorUnitario);
    const novoMedio = custoMedioPonderado(Number(locked.qtdAtual), Number(locked.valorUnitario), qtdDev, custoHist);
    const updated = await tx.estoqueItem.update({
      where: { id: orig.estoqueItemId },
      data: { qtdAtual: { increment: qtdDev }, valorUnitario: novoMedio },
    });
    if (orig.osNumero) {
      const os = await tx.ordemServico.findUnique({
        where: { estabelecimentoId_numero: { estabelecimentoId: user.estabelecimentoId, numero: orig.osNumero } },
      });
      if (os) {
        const item = await tx.ordemServicoItem.findFirst({
          where: { ordemServicoId: os.id, estoqueItemId: orig.estoqueItemId, estornado: false },
        });
        if (item) {
          const novaQtd = Number(item.quantidade) - qtdDev;
          await tx.ordemServicoItem.update({
            where: { id: item.id },
            data: novaQtd <= 1e-9 ? { estornado: true, quantidade: 0 } : { quantidade: round2(novaQtd) },
          });
        }
      }
    }
    return tx.estoqueMovimento.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        estoqueItemId: orig.estoqueItemId,
        tipo: TipoMovimentoEstoque.DEVOLUCAO,
        quantidade: qtdDev,
        motivo: motivo?.trim() || "Devolução ao estoque",
        osNumero: orig.osNumero,
        usuarioId: user.userId,
        custoUnitario: custoHist,
        estornaMovimentoId: orig.id,
        origem: orig.destino,
        destino: locked.almoxarifado,
        saldoApos: Number(updated.qtdAtual),
      },
    });
  }

  private async findItem(estabelecimentoId: string, itemCodigo: string) {
    const item = await this.prisma.estoqueItem.findUnique({
      where: { estabelecimentoId_codigo: { estabelecimentoId, codigo: itemCodigo } },
    });
    if (!item) throw new NotFoundException("Item de estoque não encontrado");
    return item;
  }

  private async findOs(estabelecimentoId: string, osNumero: number) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero: osNumero } },
    });
    if (!os) throw new NotFoundException("OS não encontrada");
    return os;
  }
}
