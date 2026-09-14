import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PERMISSAO_NIVEL, podeEditarCadastros, temPermissao } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { parseAnexoDataUrl } from "../os/os-anexos";

const DOC_SELECT = {
  id: true,
  tipo: true,
  nomeArquivo: true,
  mimeType: true,
  descricao: true,
  createdAt: true,
} as const;

@Injectable()
export class FornecedoresService {
  constructor(private readonly prisma: PrismaService) {}

  private assertVer(user: AuthUser) {
    const mapa = user.permissoesModulos;
    if (
      temPermissao(mapa, "equipamentos", PERMISSAO_NIVEL.LEITURA) ||
      temPermissao(mapa, "contratos", PERMISSAO_NIVEL.LEITURA) ||
      temPermissao(mapa, "os", PERMISSAO_NIVEL.LEITURA)
    ) {
      return;
    }
    throw new ForbiddenException("Sem permissão para ver fornecedores");
  }

  private assertEditar(user: AuthUser) {
    if (podeEditarCadastros(user.perfil, user.permissoesModulos)) return;
    if (temPermissao(user.permissoesModulos, "contratos", PERMISSAO_NIVEL.EDICAO)) return;
    throw new ForbiddenException("Somente Engenheiro/Gestor pode editar fornecedores");
  }

  list(user: AuthUser, q?: string) {
    this.assertVer(user);
    return this.prisma.fornecedor.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: { nome: "asc" },
      take: 200,
      include: {
        _count: { select: { contratos: true, equipamentos: true, atendimentos: true, contatos: true } },
      },
    });
  }

  async create(
    user: AuthUser,
    data: {
      nome: string;
      cnpj?: string;
      telefone?: string;
      email?: string;
      endereco?: string;
      especialidades?: string[];
      observacoes?: string;
    },
  ) {
    this.assertEditar(user);
    return this.prisma.fornecedor.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        cnpj: data.cnpj?.trim() || null,
        telefone: data.telefone?.trim() || null,
        email: data.email?.trim() || null,
        endereco: data.endereco?.trim() || null,
        especialidades: (data.especialidades ?? []).map((s) => s.trim()).filter(Boolean),
        observacoes: data.observacoes?.trim() || null,
      },
    });
  }

  async get(user: AuthUser, id: string) {
    this.assertVer(user);
    const f = await this.prisma.fornecedor.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: {
        contatos: { orderBy: [{ principal: "desc" }, { nome: "asc" }] },
        documentos: { select: DOC_SELECT, orderBy: { createdAt: "desc" } },
        notas: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { usuario: { select: { nome: true } } },
        },
        fabricantes: { include: { fabricante: { select: { id: true, nome: true } } } },
        contratos: {
          orderBy: { vigenciaFim: "asc" },
          select: {
            id: true,
            numero: true,
            descricao: true,
            tipo: true,
            situacao: true,
            vigenciaInicio: true,
            vigenciaFim: true,
            valor: true,
            cobrePecas: true,
            cobreServicos: true,
          },
        },
        equipamentos: {
          take: 80,
          orderBy: { tag: "asc" },
          select: { id: true, tag: true, nome: true, situacao: true, nSerie: true },
        },
      },
    });
    if (!f) throw new NotFoundException("Fornecedor não encontrado");

    const atendimentos = await this.prisma.atendimentoExterno.findMany({
      where: { fornecedorId: f.id, estabelecimentoId: user.estabelecimentoId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        ordemServico: { select: { numero: true, codigo: true, status: true } },
        equipamento: { select: { tag: true, nome: true } },
      },
    });

    return { ...f, historicoServicos: atendimentos };
  }

  async update(
    user: AuthUser,
    id: string,
    data: {
      nome?: string;
      cnpj?: string | null;
      telefone?: string | null;
      email?: string | null;
      endereco?: string | null;
      especialidades?: string[];
      observacoes?: string | null;
      ativo?: boolean;
    },
  ) {
    this.assertEditar(user);
    const existing = await this.prisma.fornecedor.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!existing) throw new NotFoundException("Fornecedor não encontrado");
    return this.prisma.fornecedor.update({
      where: { id },
      data: {
        ...(data.nome ? { nome: data.nome.trim() } : {}),
        ...(data.cnpj !== undefined ? { cnpj: data.cnpj?.trim() || null } : {}),
        ...(data.telefone !== undefined ? { telefone: data.telefone?.trim() || null } : {}),
        ...(data.email !== undefined ? { email: data.email?.trim() || null } : {}),
        ...(data.endereco !== undefined ? { endereco: data.endereco?.trim() || null } : {}),
        ...(data.especialidades
          ? { especialidades: data.especialidades.map((s) => s.trim()).filter(Boolean) }
          : {}),
        ...(data.observacoes !== undefined ? { observacoes: data.observacoes?.trim() || null } : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
      },
    });
  }

  async addContato(
    user: AuthUser,
    id: string,
    data: { nome: string; cargo?: string; telefone?: string; email?: string; principal?: boolean },
  ) {
    this.assertEditar(user);
    const f = await this.prisma.fornecedor.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!f) throw new NotFoundException();
    if (data.principal) {
      await this.prisma.fornecedorContato.updateMany({
        where: { fornecedorId: id },
        data: { principal: false },
      });
    }
    return this.prisma.fornecedorContato.create({
      data: {
        fornecedorId: id,
        nome: data.nome.trim(),
        cargo: data.cargo?.trim() || null,
        telefone: data.telefone?.trim() || null,
        email: data.email?.trim() || null,
        principal: Boolean(data.principal),
      },
    });
  }

  async removeContato(user: AuthUser, id: string, contatoId: string) {
    this.assertEditar(user);
    const c = await this.prisma.fornecedorContato.findFirst({
      where: { id: contatoId, fornecedor: { id, estabelecimentoId: user.estabelecimentoId } },
    });
    if (!c) throw new NotFoundException();
    await this.prisma.fornecedorContato.delete({ where: { id: contatoId } });
    return { ok: true };
  }

  async addNota(user: AuthUser, id: string, texto: string) {
    this.assertEditar(user);
    if (!texto?.trim()) throw new BadRequestException("Nota vazia");
    const f = await this.prisma.fornecedor.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!f) throw new NotFoundException();
    return this.prisma.fornecedorNota.create({
      data: { fornecedorId: id, texto: texto.trim(), usuarioId: user.userId },
      include: { usuario: { select: { nome: true } } },
    });
  }

  async addDocumento(
    user: AuthUser,
    id: string,
    body: { tipo?: string; dataUrl: string; nomeArquivo?: string; descricao?: string },
  ) {
    this.assertEditar(user);
    const f = await this.prisma.fornecedor.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!f) throw new NotFoundException();
    const parsed = parseAnexoDataUrl(body.dataUrl, body.nomeArquivo);
    return this.prisma.fornecedorDocumento.create({
      data: {
        fornecedorId: id,
        tipo: body.tipo?.trim() || "OUTRO",
        nomeArquivo: parsed.nomeArquivo,
        mimeType: parsed.mimeType,
        conteudo: parsed.buffer,
        descricao: body.descricao?.trim() || null,
        usuarioId: user.userId,
      },
      select: DOC_SELECT,
    });
  }

  async baixarDocumento(user: AuthUser, id: string, docId: string) {
    this.assertVer(user);
    const doc = await this.prisma.fornecedorDocumento.findFirst({
      where: { id: docId, fornecedor: { id, estabelecimentoId: user.estabelecimentoId } },
    });
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async vincularFabricante(user: AuthUser, id: string, fabricanteId: string) {
    this.assertEditar(user);
    const [f, fab] = await Promise.all([
      this.prisma.fornecedor.findFirst({ where: { id, estabelecimentoId: user.estabelecimentoId } }),
      this.prisma.fabricante.findFirst({
        where: { id: fabricanteId, estabelecimentoId: user.estabelecimentoId },
      }),
    ]);
    if (!f) throw new NotFoundException("Fornecedor não encontrado");
    if (!fab) throw new NotFoundException("Fabricante não encontrado");
    return this.prisma.fornecedorFabricante.upsert({
      where: { fornecedorId_fabricanteId: { fornecedorId: id, fabricanteId } },
      create: { fornecedorId: id, fabricanteId },
      update: {},
    });
  }

  async desvincularFabricante(user: AuthUser, id: string, fabricanteId: string) {
    this.assertEditar(user);
    await this.prisma.fornecedorFabricante.deleteMany({
      where: {
        fornecedorId: id,
        fabricanteId,
        fornecedor: { estabelecimentoId: user.estabelecimentoId },
      },
    });
    return { ok: true };
  }
}
