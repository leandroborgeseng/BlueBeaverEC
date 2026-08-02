import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { podeEditarCadastros } from "@nexo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class InstrumentosService {
  constructor(private readonly prisma: PrismaService) {}

  list(estabelecimentoId: string, q?: string) {
    return this.prisma.instrumentoPadrao.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q
          ? {
              OR: [
                { nome: { contains: q, mode: "insensitive" } },
                { nSerie: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nome: "asc" },
    }).then((rows) =>
      rows.map((r) => ({
        ...r,
        vencido: r.certificadoValidade
          ? r.certificadoValidade.getTime() < Date.now()
          : false,
        selecionavel: !(
          r.certificadoValidade && r.certificadoValidade.getTime() < Date.now()
        ),
      })),
    );
  }

  async create(
    user: AuthUser,
    data: {
      nome: string;
      nSerie: string;
      certificadoNumero?: string;
      certificadoEmissao?: string;
      certificadoValidade?: string;
      laboratorioEmissor?: string;
    },
  ) {
    if (!podeEditarCadastros(user.perfil)) throw new ForbiddenException();
    if (!data.nome?.trim() || !data.nSerie?.trim()) {
      throw new BadRequestException("Nome e nº de série obrigatórios");
    }
    return this.prisma.instrumentoPadrao.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        nSerie: data.nSerie.trim(),
        certificadoNumero: data.certificadoNumero,
        certificadoEmissao: data.certificadoEmissao
          ? new Date(data.certificadoEmissao)
          : null,
        certificadoValidade: data.certificadoValidade
          ? new Date(data.certificadoValidade)
          : null,
        laboratorioEmissor: data.laboratorioEmissor,
      },
    });
  }
}
