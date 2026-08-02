import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { StatusOS } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { OsService } from "../os/os.service";
import { EquipamentosService } from "../equipamentos/equipamentos.service";
import type { AuthUser } from "../auth/current-user.decorator";

/** Fila offline: nesta fase aceita replay idempotente por clientId (sem IndexedDB no server). */
@Injectable()
export class MobileService {
  private readonly processedClientIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly os: OsService,
    private readonly equipamentos: EquipamentosService,
  ) {}

  async minhasOs(user: AuthUser) {
    const colaborador = await this.prisma.colaborador.findFirst({
      where: { usuarioId: user.userId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!colaborador) {
      return [];
    }
    return this.os.minhasOs(user.estabelecimentoId, colaborador.id);
  }

  async kpisHoje(user: AuthUser) {
    const colaborador = await this.prisma.colaborador.findFirst({
      where: { usuarioId: user.userId, estabelecimentoId: user.estabelecimentoId },
    });
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

  async finalizar(
    user: AuthUser,
    numero: number,
    body: { observacoes?: string; assinaturaBase64: string },
  ) {
    if (!body.assinaturaBase64?.trim()) {
      throw new ForbiddenException("Assinatura digital obrigatória");
    }

    const colaborador = await this.prisma.colaborador.findFirst({
      where: { usuarioId: user.userId, estabelecimentoId: user.estabelecimentoId },
    });

    const os = await this.prisma.ordemServico.findUnique({
      where: {
        estabelecimentoId_numero: { estabelecimentoId: user.estabelecimentoId, numero },
      },
    });
    if (!os) {
      throw new NotFoundException(`OS ${numero} não encontrada`);
    }

    const isOwner = colaborador && os.responsavelId === colaborador.id;
    const isEng = ["ENGENHEIRO", "GESTOR", "ADMIN"].includes(user.perfil);
    if (!isOwner && !isEng) {
      throw new ForbiddenException("Sem permissão para finalizar esta OS");
    }

    return this.prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        status: StatusOS.CONCLUIDA,
        fechamento: new Date(),
        logs: {
          create: {
            usuarioId: user.userId,
            acao: "FECHAMENTO_MOBILE",
            justificativa: body.observacoes,
          },
        },
      },
    });
  }

  async syncQueue(
    user: AuthUser,
    items: Array<{ clientId: string; type: string; payload: Record<string, unknown> }>,
  ) {
    const results: Array<{ clientId: string; ok: boolean; detail?: string }> = [];

    for (const item of items) {
      if (this.processedClientIds.has(item.clientId)) {
        results.push({ clientId: item.clientId, ok: true, detail: "idempotent" });
        continue;
      }

      try {
        if (item.type === "FINALIZAR_OS") {
          await this.finalizar(user, Number(item.payload.numero), {
            observacoes: String(item.payload.observacoes ?? ""),
            assinaturaBase64: String(item.payload.assinaturaBase64 ?? "offline"),
          });
        }
        this.processedClientIds.add(item.clientId);
        results.push({ clientId: item.clientId, ok: true });
      } catch (e) {
        results.push({
          clientId: item.clientId,
          ok: false,
          detail: e instanceof Error ? e.message : "erro",
        });
      }
    }

    return { processed: results.length, results };
  }
}
