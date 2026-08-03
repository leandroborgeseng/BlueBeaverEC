import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { StatusOS } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OsService } from "../os/os.service";
import { EquipamentosService } from "../equipamentos/equipamentos.service";
import { EstoqueService } from "../estoque/estoque.service";
import { SolicitacoesService } from "../solicitacoes/solicitacoes.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class MobileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly os: OsService,
    private readonly equipamentos: EquipamentosService,
    private readonly estoque: EstoqueService,
    private readonly solicitacoes: SolicitacoesService,
  ) {}

  async minhasOs(user: AuthUser) {
    const colaborador = await this.colaborador(user);
    if (!colaborador) return [];
    return this.os.minhasOs(user.estabelecimentoId, colaborador.id);
  }

  async proximos(user: AuthUser, limit = 5) {
    const colaborador = await this.colaborador(user);
    if (!colaborador) return [];
    return this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        responsavelId: colaborador.id,
        status: { in: [StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
      },
      include: { equipamento: { include: { setor: true } } },
      orderBy: [{ prioridade: "desc" }, { abertura: "asc" }],
      take: limit,
    });
  }

  async kpisHoje(user: AuthUser) {
    const colaborador = await this.colaborador(user);
    if (!colaborador) {
      return { abertas: 0, urgentes: 0, concluidasHoje: 0 };
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [abertas, urgentes, concluidasHoje] = await Promise.all([
      this.prisma.ordemServico.count({
        where: {
          estabelecimentoId: user.estabelecimentoId,
          responsavelId: colaborador.id,
          status: { in: [StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
        },
      }),
      this.prisma.ordemServico.count({
        where: {
          estabelecimentoId: user.estabelecimentoId,
          responsavelId: colaborador.id,
          status: { in: [StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
          prioridade: "URGENTE",
        },
      }),
      this.prisma.ordemServico.count({
        where: {
          estabelecimentoId: user.estabelecimentoId,
          responsavelId: colaborador.id,
          status: StatusOS.CONCLUIDA,
          fechamento: { gte: start },
        },
      }),
    ]);

    return { abertas, urgentes, concluidasHoje };
  }

  equipamentoQr(user: AuthUser, codigo: string) {
    return this.equipamentos.byQr(user.estabelecimentoId, codigo);
  }

  async detalheOs(user: AuthUser, numero: number) {
    const os = await this.findOs(user.estabelecimentoId, numero);
    const detail = await this.prisma.ordemServico.findUnique({
      where: { id: os.id },
      include: {
        equipamento: {
          include: {
            setor: true,
            tipoEquipamentoPlano: {
              include: {
                testes: { where: { ativo: true } },
              },
            },
          },
        },
        checklistMobile: true,
        fotosMobile: { orderBy: { createdAt: "desc" }, take: 20 },
        itens: true,
      },
    });
    if (!detail) throw new NotFoundException("OS não encontrada");

    const checklistSugerido = await this.checklistSugeridoParaOs(user.estabelecimentoId, detail);
    return { ...detail, checklistSugerido };
  }

  private async checklistSugeridoParaOs(
    estabelecimentoId: string,
    os: {
      tipo: string;
      equipamento: {
        tipoEquipamentoPlano?: {
          testes: Array<{ tipoTeste: string; procedimentoCodigo: string }>;
        } | null;
      };
    },
  ): Promise<Array<{ id: string; label: string; ok: boolean }> | null> {
    const mapTipo: Record<string, string> = {
      PREVENTIVA: "PREVENTIVA",
      CALIBRACAO: "CALIBRACAO",
      TSE: "TSE",
      QUALIFICACAO: "QUALIFICACAO",
      RECEBIMENTO: "RECEBIMENTO",
    };
    const tipoTeste = mapTipo[os.tipo];
    if (!tipoTeste) return null;

    let codigo: string | undefined;
    const testes = os.equipamento.tipoEquipamentoPlano?.testes ?? [];
    const match = testes.find((t) => t.tipoTeste === tipoTeste);
    if (match) codigo = match.procedimentoCodigo;

    const proc = await this.prisma.procedimentoLaudo.findFirst({
      where: {
        estabelecimentoId,
        tipo: tipoTeste as never,
        ativo: true,
        ...(codigo ? { OR: [{ nome: { contains: codigo, mode: "insensitive" } }, { pop: { codigo } }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!proc) {
      const fallback = await this.prisma.procedimentoLaudo.findFirst({
        where: { estabelecimentoId, tipo: tipoTeste as never, ativo: true },
        orderBy: { updatedAt: "desc" },
      });
      if (!fallback) return null;
      return this.itensProcToChecklist(fallback.itens);
    }
    return this.itensProcToChecklist(proc.itens);
  }

  private itensProcToChecklist(itens: unknown): Array<{ id: string; label: string; ok: boolean }> {
    const arr = Array.isArray(itens) ? itens : [];
    return arr
      .map((raw, i) => {
        const it = raw as { id?: string; pergunta?: string; label?: string };
        const label = String(it.pergunta ?? it.label ?? "").trim();
        if (!label) return null;
        return { id: String(it.id ?? `item-${i + 1}`), label, ok: false };
      })
      .filter((x): x is { id: string; label: string; ok: boolean } => Boolean(x))
      .slice(0, 80);
  }

  async checklist(
    user: AuthUser,
    numero: number,
    itens: Array<{ id: string; label: string; ok: boolean }>,
  ) {
    const os = await this.findOs(user.estabelecimentoId, numero);
    await this.assertPodeExecutar(user, os);
    return this.prisma.osChecklistMobile.upsert({
      where: { ordemServicoId: os.id },
      create: { ordemServicoId: os.id, itens },
      update: { itens },
    });
  }

  async fotos(user: AuthUser, numero: number, fotos: Array<{ dataUrl: string; legenda?: string }>) {
    const os = await this.findOs(user.estabelecimentoId, numero);
    await this.assertPodeExecutar(user, os);
    if (!fotos?.length) throw new BadRequestException("Informe ao menos uma foto");
    const created = [];
    for (const f of fotos) {
      if (!f.dataUrl?.startsWith("data:")) {
        throw new BadRequestException("Foto deve ser data URL base64");
      }
      created.push(
        await this.prisma.osFotoMobile.create({
          data: {
            ordemServicoId: os.id,
            dataUrl: f.dataUrl.slice(0, 2_000_000),
            legenda: f.legenda,
          },
        }),
      );
    }
    return created;
  }

  async pecas(user: AuthUser, numero: number, body: { itemCodigo: string; qtd: number }) {
    const os = await this.findOs(user.estabelecimentoId, numero);
    await this.assertPodeExecutar(user, os);
    if (!body.itemCodigo || !(body.qtd > 0)) {
      throw new BadRequestException("itemCodigo e qtd > 0 obrigatórios");
    }
    return this.estoque.baixar(user, body.itemCodigo, body.qtd, numero);
  }

  private assertAssinaturaValida(assinaturaBase64: string) {
    const raw = assinaturaBase64?.trim() ?? "";
    if (!raw || raw === "offline" || raw.length < 100) {
      throw new BadRequestException("Assinatura digital inválida ou ausente");
    }
    if (!raw.startsWith("data:image")) {
      throw new BadRequestException("Assinatura deve ser uma imagem (data URL)");
    }
  }

  async finalizar(
    user: AuthUser,
    numero: number,
    body: { observacoes?: string; assinaturaBase64: string },
  ) {
    this.assertAssinaturaValida(body.assinaturaBase64);

    const os = await this.findOs(user.estabelecimentoId, numero);
    await this.assertPodeExecutar(user, os);

    if (os.pendencia?.trim()) {
      throw new ConflictException("Não é possível finalizar OS com pendência aberta");
    }

    await this.os.assertLaudoAprovadoParaFechar(user, os);

    return this.prisma.$transaction(async (tx) => {
      const reservas = await tx.estoqueReserva.findMany({
        where: { ordemServicoId: os.id, ativa: true },
      });
      for (const r of reservas) {
        await tx.estoqueItem.update({
          where: { id: r.estoqueItemId },
          data: { qtdAtual: { decrement: r.quantidade } },
        });
      }
      await tx.estoqueReserva.updateMany({
        where: { ordemServicoId: os.id, ativa: true },
        data: { ativa: false },
      });
      return tx.ordemServico.update({
        where: { id: os.id },
        data: {
          status: StatusOS.CONCLUIDA,
          fechamento: new Date(),
          logs: {
            create: {
              usuarioId: user.userId,
              acao: "FECHAMENTO_MOBILE",
              justificativa: [
                body.observacoes,
                `assinatura:${body.assinaturaBase64.slice(0, 80)}`,
              ]
                .filter(Boolean)
                .join(" | "),
            },
          },
        },
      });
    });
  }

  async syncQueue(
    user: AuthUser,
    items: Array<{ clientId: string; type: string; payload: Record<string, unknown> }>,
  ) {
    const results: Array<{ clientId: string; ok: boolean; detail?: string }> = [];

    for (const item of items) {
      const already = await this.prisma.mobileSyncIdempotency.findUnique({
        where: {
          estabelecimentoId_clientId: {
            estabelecimentoId: user.estabelecimentoId,
            clientId: item.clientId,
          },
        },
      });
      if (already) {
        results.push({ clientId: item.clientId, ok: true, detail: "idempotent" });
        continue;
      }

      try {
        // Reserva a chave antes do efeito — retry não duplica fotos/baixas.
        await this.prisma.mobileSyncIdempotency.create({
          data: {
            estabelecimentoId: user.estabelecimentoId,
            clientId: item.clientId,
            tipo: item.type,
          },
        });
      } catch (e) {
        const code = typeof e === "object" && e && "code" in e ? String((e as { code: string }).code) : "";
        if (code === "P2002") {
          results.push({ clientId: item.clientId, ok: true, detail: "idempotent" });
          continue;
        }
        results.push({
          clientId: item.clientId,
          ok: false,
          detail: e instanceof Error ? e.message : "erro",
        });
        continue;
      }

      try {
        await this.dispatchSync(user, item.type, item.payload);
        results.push({ clientId: item.clientId, ok: true });
      } catch (e) {
        await this.prisma.mobileSyncIdempotency
          .delete({
            where: {
              estabelecimentoId_clientId: {
                estabelecimentoId: user.estabelecimentoId,
                clientId: item.clientId,
              },
            },
          })
          .catch(() => undefined);
        results.push({
          clientId: item.clientId,
          ok: false,
          detail: e instanceof Error ? e.message : "erro",
        });
      }
    }

    return {
      processed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  private async dispatchSync(user: AuthUser, type: string, payload: Record<string, unknown>) {
    switch (type) {
      case "FINALIZAR_OS":
        await this.finalizar(user, Number(payload.numero), {
          observacoes: String(payload.observacoes ?? ""),
          assinaturaBase64: String(payload.assinaturaBase64 ?? ""),
        });
        break;
      case "CHECKLIST":
        await this.checklist(
          user,
          Number(payload.numero),
          (payload.itens as Array<{ id: string; label: string; ok: boolean }>) ?? [],
        );
        break;
      case "FOTOS":
        await this.fotos(
          user,
          Number(payload.numero),
          (payload.fotos as Array<{ dataUrl: string; legenda?: string }>) ?? [],
        );
        break;
      case "PECAS":
        await this.pecas(user, Number(payload.numero), {
          itemCodigo: String(payload.itemCodigo),
          qtd: Number(payload.qtd),
        });
        break;
      case "SOLICITACAO":
        await this.solicitacoes.create(user, {
          descricao: String(payload.descricao ?? ""),
          setorNome: String(payload.setorNome ?? "Geral"),
          urgencia: (payload.urgencia as "BAIXA" | "MEDIA" | "ALTA" | "PARADA_CRITICA") || "MEDIA",
          equipamentoTag: payload.equipamentoTag ? String(payload.equipamentoTag) : undefined,
          solicitanteNome: payload.solicitanteNome ? String(payload.solicitanteNome) : undefined,
          ramal: payload.ramal ? String(payload.ramal) : undefined,
        });
        break;
      default:
        throw new BadRequestException(`Tipo de sync desconhecido: ${type}`);
    }
  }

  private colaborador(user: AuthUser) {
    return this.prisma.colaborador.findFirst({
      where: { usuarioId: user.userId, estabelecimentoId: user.estabelecimentoId },
    });
  }

  private async findOs(estabelecimentoId: string, numero: number) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero } },
    });
    if (!os) throw new NotFoundException(`OS ${numero} não encontrada`);
    return os;
  }

  private async assertPodeExecutar(
    user: AuthUser,
    os: { responsavelId: string | null },
  ) {
    const colaborador = await this.colaborador(user);
    const isOwner = colaborador && os.responsavelId === colaborador.id;
    const isEng = ["ENGENHEIRO", "GESTOR", "ADMIN"].includes(user.perfil);
    if (!isOwner && !isEng) {
      throw new ForbiddenException("Sem permissão para executar esta OS");
    }
  }
}
