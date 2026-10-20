import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { StatusProcedimentoVersao, TipoDocumentoEmitido, TipoLaudo } from "@prisma/client";
import {
  PERMISSAO_NIVEL,
  achatarParaItens,
  arvoreDeItensLegados,
  avisoTituloIncoerente,
  numerarArvore,
  podeEditarModulo,
  resolverHeranca,
  rotuloProcedimento,
  temPermissao,
  temPermissaoEspecial,
  validarFormaArvore,
  validarPublicacao,
  verificarCadeiaPais,
  type ArvoreProcedimento,
  type ItemChecklistModelo,
} from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

export const MSG_ROTA_DEPRECIADA =
  "Rota depreciada (E2): itens do procedimento agora são editados no rascunho da versão (PATCH /procedimentos-laudo/:id/versoes/:vid). Será removida na E3.";
export const MSG_SO_RASCUNHO = "Versão publicada é imutável; abra um novo rascunho para editar";
export const MSG_CONFLITO_RASCUNHO = "O rascunho foi alterado por outra pessoa; recarregue antes de salvar";
export const MSG_SEM_PERMISSAO_PUBLICAR = "Publicar exige a permissão Publicar procedimentos. Peça a um administrador.";

export type CreateProcedimentoInput = {
  nome?: string;
  codigo: string;
  tituloLaudo: string;
  tipo: TipoLaudo;
  tipoDocumento?: TipoDocumentoEmitido;
  generico?: boolean;
  validadeMeses?: number;
  norma?: string;
  paiId?: string | null;
  itens?: unknown[];
};

export type RascunhoInput = {
  atualizadoEm: string;
  codigo?: string;
  tituloLaudo?: string;
  tipoDocumento?: TipoDocumentoEmitido;
  generico?: boolean;
  validadeMeses?: number;
  norma?: string | null;
  paiId?: string | null;
  arvore?: unknown;
  certificadoCfg?: Record<string, unknown> | null;
  criterioReferencia?: string | null;
  criterioVersao?: string | null;
};

const SELECT_VERSAO_RESUMO = {
  id: true,
  versao: true,
  status: true,
  codigo: true,
  tituloLaudo: true,
  tipoDocumento: true,
  publicadoEm: true,
  publicadoPorNome: true,
  createdAt: true,
  createdByNome: true,
  atualizadoEm: true,
} as const;

@Injectable()
export class ProcedimentosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(estabelecimentoId: string, tipo?: TipoLaudo, incluirInativos = false) {
    const procs = await this.prisma.procedimentoLaudo.findMany({
      where: { estabelecimentoId, ...(incluirInativos ? {} : { ativo: true }), ...(tipo ? { tipo } : {}) },
      include: {
        modelos: { include: { modelo: { include: { fabricante: true } } } },
        versaoPublicada: { select: SELECT_VERSAO_RESUMO },
        historico: {
          orderBy: { versao: "desc" },
          take: 8,
          select: { id: true, versao: true, status: true, createdAt: true, createdByNome: true, publicadoEm: true },
        },
      },
      orderBy: [{ codigo: "asc" }, { nome: "asc" }],
    });
    return procs.map((p) => {
      const pub = p.versaoPublicada;
      return {
        ...p,
        rascunhoId: p.historico.find((h) => h.status === StatusProcedimentoVersao.RASCUNHO)?.id ?? null,
        rotulo: rotuloProcedimento({
          codigo: pub?.codigo ?? p.codigo,
          titulo: pub?.tituloLaudo ?? p.nome,
          versao: pub?.versao ?? p.versao,
          publicadoEm: pub?.publicadoEm ?? (p.versaoPublicadaId ? null : this.ehLegado(p.historico) ? p.updatedAt : null),
        }),
      };
    });
  }

  async byId(estabelecimentoId: string, id: string) {
    const proc = await this.prisma.procedimentoLaudo.findFirst({
      where: { id, estabelecimentoId },
      include: {
        modelos: { include: { modelo: { include: { fabricante: true } } } },
        historico: { orderBy: { versao: "desc" } },
        versaoPublicada: true,
        pai: { select: { id: true, codigo: true, nome: true, versaoPublicadaId: true } },
        derivados: { select: { id: true, codigo: true, nome: true } },
        planos: { select: { id: true, tipoTeste: true, procedimentoCodigo: true } },
      },
    });
    if (!proc) throw new NotFoundException("Procedimento não encontrado");
    const avisos = await this.avisosPai(proc);
    const rascunho = proc.historico.find((h) => h.status === StatusProcedimentoVersao.RASCUNHO) ?? null;
    return { ...proc, rascunho, avisos };
  }

  /** Q4: o derivado fica preso à versão do pai que usou; avisa quando o pai tem versão publicada mais nova. */
  private async avisosPai(proc: { paiId: string | null; versaoPublicada?: { paiVersaoId: string | null } | null }) {
    const avisos: string[] = [];
    if (!proc.paiId) return avisos;
    const pai = await this.prisma.procedimentoLaudo.findFirst({
      where: { id: proc.paiId },
      select: { versaoPublicadaId: true, versaoPublicada: { select: { versao: true } } },
    });
    if (pai?.versaoPublicadaId && proc.versaoPublicada && pai.versaoPublicadaId !== proc.versaoPublicada.paiVersaoId) {
      avisos.push(`Procedimento pai tem versão ${pai.versaoPublicada?.versao}`);
    }
    return avisos;
  }

  private ehLegado(historico: Array<{ status: StatusProcedimentoVersao | null }>) {
    return historico.some((h) => h.status == null);
  }

  /** Crit. 5: nasce em RASCUNHO, com código único, título, tipo, genérico, validade e norma. */
  async create(user: AuthUser, data: CreateProcedimentoInput) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    if (data.itens?.length) throw new BadRequestException(MSG_ROTA_DEPRECIADA);
    const codigo = data.codigo.trim();
    const titulo = data.tituloLaudo.trim();
    await this.assertCodigoLivre(user.estabelecimentoId, codigo, null);
    if (data.paiId) await this.validarPai(user.estabelecimentoId, null, data.paiId);
    const autor = await this.autorNome(user);
    const agora = new Date();
    return this.prisma
      .$transaction(async (tx) => {
        const proc = await tx.procedimentoLaudo.create({
          data: {
            estabelecimentoId: user.estabelecimentoId,
            nome: data.nome?.trim() || titulo,
            codigo,
            tipo: data.tipo,
            generico: data.generico ?? false,
            validadeMeses: data.validadeMeses ?? 12,
            itens: [],
            versao: 1,
            paiId: data.paiId ?? null,
          },
        });
        const versao = await tx.procedimentoLaudoVersao.create({
          data: {
            estabelecimentoId: user.estabelecimentoId,
            procedimentoId: proc.id,
            versao: 1,
            status: StatusProcedimentoVersao.RASCUNHO,
            nome: proc.nome,
            codigo,
            tituloLaudo: titulo,
            tipo: data.tipo,
            tipoDocumento: data.tipoDocumento ?? null,
            generico: data.generico ?? false,
            norma: data.norma?.trim() || null,
            paiId: data.paiId ?? null,
            validadeMeses: data.validadeMeses ?? 12,
            itens: [],
            arvore: { nos: [] },
            createdById: user.userId,
            createdByNome: autor,
            atualizadoEm: agora,
          },
        });
        return { ...proc, rascunho: versao };
      })
      .catch((e) => this.mapUnique(e, codigo));
  }

  /** Crit. 8: editar abre nova versão em rascunho (idempotente: devolve o rascunho aberto). */
  async abrirRascunho(user: AuthUser, id: string) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const proc = await this.findOwned(user.estabelecimentoId, id);
    const aberto = await this.prisma.procedimentoLaudoVersao.findFirst({
      where: { procedimentoId: proc.id, status: StatusProcedimentoVersao.RASCUNHO },
    });
    if (aberto) return aberto;
    const base = proc.versaoPublicadaId
      ? await this.prisma.procedimentoLaudoVersao.findUnique({ where: { id: proc.versaoPublicadaId } })
      : null;
    const ultima = await this.prisma.procedimentoLaudoVersao.findFirst({
      where: { procedimentoId: proc.id },
      orderBy: { versao: "desc" },
      select: { versao: true },
    });
    const autor = await this.autorNome(user);
    const arvore = (base?.arvore as ArvoreProcedimento | null) ?? arvoreDeItensLegados(proc.itens as ItemChecklistModelo[]);
    return this.prisma.procedimentoLaudoVersao
      .create({
        data: {
          estabelecimentoId: proc.estabelecimentoId,
          procedimentoId: proc.id,
          versao: Math.max(ultima?.versao ?? 0, proc.versao) + 1,
          status: StatusProcedimentoVersao.RASCUNHO,
          nome: proc.nome,
          codigo: base?.codigo ?? proc.codigo,
          tituloLaudo: base?.tituloLaudo ?? proc.nome,
          tipo: proc.tipo,
          tipoDocumento: base?.tipoDocumento ?? null,
          generico: base?.generico ?? proc.generico ?? false,
          norma: base?.norma ?? null,
          paiId: base?.paiId ?? proc.paiId,
          validadeMeses: base?.validadeMeses ?? proc.validadeMeses,
          criterioReferencia: base?.criterioReferencia ?? proc.criterioReferencia,
          criterioVersao: base?.criterioVersao ?? proc.criterioVersao,
          itens: [],
          arvore: arvore as object,
          certificadoCfg: (base?.certificadoCfg as object) ?? undefined,
          createdById: user.userId,
          createdByNome: autor,
          atualizadoEm: new Date(),
        },
      })
      .catch(async (e: { code?: string }) => {
        if (e?.code !== "P2002") throw e;
        // corrida: outro usuário abriu o rascunho ao mesmo tempo (índice parcial de 1 rascunho)
        const r = await this.prisma.procedimentoLaudoVersao.findFirst({
          where: { procedimentoId: proc.id, status: StatusProcedimentoVersao.RASCUNHO },
        });
        if (!r) throw new ConflictException("Rascunho em criação por outra pessoa; recarregue");
        return r;
      });
  }

  /** Salva o rascunho com controle de concorrência (atualizadoEm). Versão publicada é imutável (Q8). */
  async salvarRascunho(user: AuthUser, id: string, vid: string, data: RascunhoInput) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const proc = await this.findOwned(user.estabelecimentoId, id);
    const v = await this.prisma.procedimentoLaudoVersao.findFirst({ where: { id: vid, procedimentoId: proc.id } });
    if (!v) throw new NotFoundException("Versão não encontrada");
    if (v.status !== StatusProcedimentoVersao.RASCUNHO) throw new ConflictException(MSG_SO_RASCUNHO);
    const mexeCriterio = data.criterioReferencia !== undefined || data.criterioVersao !== undefined;
    if (mexeCriterio && !temPermissao(user.permissoesModulos, "laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Só pessoa autorizada define critério de aceitação (referência e versão)");
    }
    if (data.arvore !== undefined) {
      const erros = validarFormaArvore(data.arvore);
      if (erros.length) throw new BadRequestException(erros.join("; "));
    }
    if (data.codigo !== undefined) await this.assertCodigoLivre(user.estabelecimentoId, data.codigo.trim(), proc.id);
    if (data.paiId) await this.validarPai(user.estabelecimentoId, proc.id, data.paiId);
    const token = new Date(data.atualizadoEm);
    if (Number.isNaN(token.getTime())) throw new BadRequestException("atualizadoEm inválido");
    const agora = new Date();
    const r = await this.prisma.procedimentoLaudoVersao.updateMany({
      where: { id: v.id, status: StatusProcedimentoVersao.RASCUNHO, atualizadoEm: token },
      data: {
        ...(data.codigo !== undefined ? { codigo: data.codigo.trim() } : {}),
        ...(data.tituloLaudo !== undefined ? { tituloLaudo: data.tituloLaudo.trim() } : {}),
        ...(data.tipoDocumento !== undefined ? { tipoDocumento: data.tipoDocumento } : {}),
        ...(data.generico !== undefined ? { generico: data.generico } : {}),
        ...(data.validadeMeses !== undefined ? { validadeMeses: data.validadeMeses } : {}),
        ...(data.norma !== undefined ? { norma: data.norma?.trim() || null } : {}),
        ...(data.paiId !== undefined ? { paiId: data.paiId || null } : {}),
        ...(data.arvore !== undefined ? { arvore: data.arvore as object } : {}),
        ...(data.certificadoCfg !== undefined ? { certificadoCfg: (data.certificadoCfg ?? {}) as object } : {}),
        ...(data.criterioReferencia !== undefined ? { criterioReferencia: data.criterioReferencia?.trim() || null } : {}),
        ...(data.criterioVersao !== undefined ? { criterioVersao: data.criterioVersao?.trim() || null } : {}),
        atualizadoEm: agora,
      },
    });
    if (r.count !== 1) throw new ConflictException(MSG_CONFLITO_RASCUNHO);
    const salvo = await this.prisma.procedimentoLaudoVersao.findUnique({ where: { id: v.id } });
    const aviso = avisoTituloIncoerente(salvo?.tipoDocumento, (salvo?.certificadoCfg as { tituloImpresso?: string } | null)?.tituloImpresso ?? null);
    return { ...salvo, avisos: aviso ? [aviso] : [] };
  }

  /** Resolve herança (6e, Q3/Q4) e valida para publicação (5, 10, 11a, 6f, B10, B11). */
  async validarParaPublicar(estabelecimentoId: string, id: string, vid: string) {
    const proc = await this.findOwned(estabelecimentoId, id);
    const v = await this.prisma.procedimentoLaudoVersao.findFirst({ where: { id: vid, procedimentoId: proc.id } });
    if (!v) throw new NotFoundException("Versão não encontrada");
    const bloqueios: string[] = [];
    let resolvida: ArvoreProcedimento | undefined;
    let paiVersaoId: string | null = null;
    const forma = validarFormaArvore(v.arvore);
    if (!forma.length) {
      const arv = v.arvore as ArvoreProcedimento;
      if (v.paiId) {
        try {
          await this.validarPai(estabelecimentoId, proc.id, v.paiId);
          const pai = await this.prisma.procedimentoLaudo.findFirst({
            where: { id: v.paiId, estabelecimentoId },
            include: { versaoPublicada: true },
          });
          const pv = pai?.versaoPublicada;
          const paiArv = (pv?.itensResolvidos as { arvore?: ArvoreProcedimento } | null)?.arvore;
          if (!pv || !paiArv) bloqueios.push("Procedimento pai sem versão publicada.");
          else {
            resolvida = resolverHeranca([paiArv, arv]);
            paiVersaoId = pv.id;
          }
        } catch (e) {
          bloqueios.push((e as Error).message);
        }
      } else resolvida = resolverHeranca([arv]);
    }
    const r = validarPublicacao(
      { codigo: v.codigo, tituloLaudo: v.tituloLaudo, tipoDocumento: v.tipoDocumento, validadeMeses: v.validadeMeses, arvore: v.arvore },
      resolvida,
    );
    const aviso = avisoTituloIncoerente(v.tipoDocumento, (v.certificadoCfg as { tituloImpresso?: string } | null)?.tituloImpresso);
    return {
      proc,
      versao: v,
      resolvida,
      paiVersaoId,
      bloqueios: [...bloqueios, ...r.bloqueios],
      avisos: [...r.avisos, ...(aviso ? [aviso] : [])],
    };
  }

  async previaPublicacao(user: AuthUser, id: string, vid: string) {
    const r = await this.validarParaPublicar(user.estabelecimentoId, id, vid);
    return {
      bloqueios: r.bloqueios,
      avisos: r.avisos,
      numeracao: r.resolvida ? numerarArvore(r.resolvida.nos) : [],
      itens: r.resolvida ? achatarParaItens(r.resolvida).length : 0,
    };
  }

  /** Crit. 8: publica (versão + data), arquiva a anterior e espelha no procedimento (leitores legados). */
  async publicar(user: AuthUser, id: string, vid: string, opts: { confirmarAvisos?: boolean } = {}) {
    if (!temPermissaoEspecial(user.permissoesEspeciais, "procedimento.publicar")) {
      throw new ForbiddenException(MSG_SEM_PERMISSAO_PUBLICAR);
    }
    const r = await this.validarParaPublicar(user.estabelecimentoId, id, vid);
    if (r.versao.status !== StatusProcedimentoVersao.RASCUNHO) throw new ConflictException(MSG_SO_RASCUNHO);
    if (r.bloqueios.length) {
      throw new UnprocessableEntityException({ message: "Publicação bloqueada", bloqueios: r.bloqueios, avisos: r.avisos });
    }
    if (r.avisos.length && !opts.confirmarAvisos) {
      throw new BadRequestException({ message: "Confirme os avisos para publicar", avisos: r.avisos });
    }
    const resolvida = r.resolvida!;
    const itens = achatarParaItens(resolvida);
    const autor = await this.autorNome(user);
    const agora = new Date();
    const anteriorId = r.proc.versaoPublicadaId ?? null;
    const v = r.versao;
    const publicada = await this.prisma
      .$transaction(async (tx) => {
        const a = await tx.procedimentoLaudoVersao.updateMany({
          where: { id: v.id, status: StatusProcedimentoVersao.RASCUNHO, atualizadoEm: v.atualizadoEm },
          data: {
            status: StatusProcedimentoVersao.PUBLICADO,
            publicadoEm: agora,
            publicadoPorId: user.userId,
            publicadoPorNome: autor,
            nome: v.tituloLaudo ?? v.nome,
            itens: itens as object[],
            itensResolvidos: { arvore: resolvida, itens } as object,
            paiVersaoId: r.paiVersaoId,
          },
        });
        if (a.count !== 1) throw new ConflictException("Rascunho já publicado ou alterado por outra pessoa; recarregue");
        if (anteriorId) {
          await tx.procedimentoLaudoVersao.updateMany({
            where: { id: anteriorId, status: StatusProcedimentoVersao.PUBLICADO },
            data: { status: StatusProcedimentoVersao.ARQUIVADO },
          });
        }
        const b = await tx.procedimentoLaudo.updateMany({
          where: { id: r.proc.id, versaoPublicadaId: anteriorId },
          data: {
            versaoPublicadaId: v.id,
            versao: v.versao,
            codigo: v.codigo,
            nome: v.tituloLaudo ?? r.proc.nome,
            itens: itens as object[],
            validadeMeses: v.validadeMeses,
            generico: v.generico,
            paiId: v.paiId,
            criterioReferencia: v.criterioReferencia,
            criterioVersao: v.criterioVersao,
            criterioAutorNome: v.criterioReferencia || v.criterioVersao ? autor : r.proc.criterioAutorNome,
            criterioAtualizadoEm: v.criterioReferencia || v.criterioVersao ? agora : r.proc.criterioAtualizadoEm,
          },
        });
        if (b.count !== 1) throw new ConflictException("Outra publicação deste procedimento aconteceu agora; recarregue");
        await tx.logAcesso.create({
          data: {
            usuarioId: user.userId,
            acao: "PROCEDIMENTO_PUBLICADO",
            detalhe: JSON.stringify({
              estabelecimentoId: user.estabelecimentoId,
              procedimentoId: r.proc.id,
              versaoId: v.id,
              versao: v.versao,
              anteriorId,
              tipoDocumento: v.tipoDocumento,
              avisos: r.avisos,
            }),
          },
        });
        return tx.procedimentoLaudoVersao.findUnique({ where: { id: v.id } });
      })
      .catch((e) => this.mapUnique(e, v.codigo ?? ""));
    return { versao: publicada, avisos: r.avisos };
  }

  /** Crit. 11: não há exclusão; procedimento (com ou sem laudo) só pode ser inativado. */
  async inativar(user: AuthUser, id: string) {
    if (!temPermissao(user.permissoesModulos, "laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Inativar procedimento exige aprovação em Laudos");
    }
    const proc = await this.findOwned(user.estabelecimentoId, id);
    const laudos = await this.prisma.laudo.count({ where: { procedimentoId: proc.id } });
    const updated = await this.prisma.procedimentoLaudo.update({ where: { id: proc.id }, data: { ativo: false } });
    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "PROCEDIMENTO_INATIVADO",
        detalhe: JSON.stringify({ estabelecimentoId: user.estabelecimentoId, procedimentoId: proc.id, laudos }),
      },
    });
    return updated;
  }

  /** Reverso do inativar (decisão TL 20/10): mesma permissão, auditado; já ativo → 409. */
  async reativar(user: AuthUser, id: string) {
    if (!temPermissao(user.permissoesModulos, "laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Reativar procedimento exige aprovação em Laudos");
    }
    const proc = await this.findOwned(user.estabelecimentoId, id);
    if (proc.ativo) throw new ConflictException("Procedimento já está ativo");
    const updated = await this.prisma.procedimentoLaudo.update({ where: { id: proc.id }, data: { ativo: true } });
    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "PROCEDIMENTO_REATIVADO",
        detalhe: JSON.stringify({ estabelecimentoId: user.estabelecimentoId, procedimentoId: proc.id }),
      },
    });
    return updated;
  }

  async versoes(estabelecimentoId: string, id: string) {
    const proc = await this.findOwned(estabelecimentoId, id);
    return this.prisma.procedimentoLaudoVersao.findMany({
      where: { procedimentoId: proc.id },
      orderBy: { versao: "desc" },
      select: SELECT_VERSAO_RESUMO,
    });
  }

  async versao(estabelecimentoId: string, id: string, vid: string) {
    const proc = await this.findOwned(estabelecimentoId, id);
    const v = await this.prisma.procedimentoLaudoVersao.findFirst({ where: { id: vid, procedimentoId: proc.id } });
    if (!v) throw new NotFoundException("Versão não encontrada");
    return v;
  }

  /** Diferenças entre duas versões (por id de nó): incluídos, removidos, alterados. */
  async diff(estabelecimentoId: string, id: string, de: string, para: string) {
    const [a, b] = await Promise.all([this.versao(estabelecimentoId, id, de), this.versao(estabelecimentoId, id, para)]);
    const arv = (x: typeof a) =>
      (x.itensResolvidos as { arvore?: ArvoreProcedimento } | null)?.arvore ??
      (x.arvore as ArvoreProcedimento | null) ??
      arvoreDeItensLegados(x.itens as ItemChecklistModelo[]);
    const mapa = (t: ArvoreProcedimento) => {
      const m = new Map<string, string>();
      const v = (ns: ArvoreProcedimento["nos"]) =>
        ns.forEach((n) => {
          m.set(n.id, JSON.stringify({ titulo: n.titulo, item: n.item ?? null }));
          v(n.filhos ?? []);
        });
      v(t.nos);
      return m;
    };
    const ma = mapa(arv(a));
    const mb = mapa(arv(b));
    const campos = ["codigo", "tituloLaudo", "tipoDocumento", "validadeMeses", "norma", "generico", "paiId"] as const;
    return {
      de: a.versao,
      para: b.versao,
      cabecalho: campos.filter((c) => (a as Record<string, unknown>)[c] !== (b as Record<string, unknown>)[c]),
      incluidos: [...mb.keys()].filter((k) => !ma.has(k)),
      removidos: [...ma.keys()].filter((k) => !mb.has(k)),
      alterados: [...mb.keys()].filter((k) => ma.has(k) && ma.get(k) !== mb.get(k)),
    };
  }

  /** Q7: leitura dos itens planos (depreciada; some na E3). */
  async itensDepreciados(estabelecimentoId: string, id: string) {
    const proc = await this.findOwned(estabelecimentoId, id);
    return { id: proc.id, versao: proc.versao, itens: proc.itens };
  }

  rotaDepreciada(): never {
    throw new GoneException(MSG_ROTA_DEPRECIADA);
  }

  /** Crit. 9: só procedimento publicado (ou legado) é vinculado a modelos e planos. */
  private assertVinculavel(proc: { versaoPublicadaId: string | null; codigo: string | null; ativo: boolean; versao: number }, legado: boolean) {
    if (!proc.ativo) throw new ConflictException("Procedimento inativo");
    if (!proc.versaoPublicadaId && !legado) throw new ConflictException("Publique o procedimento antes de vincular");
  }

  private async ehProcLegado(id: string) {
    return (await this.prisma.procedimentoLaudoVersao.count({ where: { procedimentoId: id, status: null } })) > 0;
  }

  async vincularModelo(user: AuthUser, id: string, modeloId: string) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const proc = await this.findOwned(user.estabelecimentoId, id);
    this.assertVinculavel(proc, await this.ehProcLegado(proc.id));
    const outros = await this.prisma.procedimentoModelo.findMany({
      where: {
        modeloId,
        procedimento: {
          estabelecimentoId: user.estabelecimentoId,
          tipo: proc.tipo,
          NOT: { id: proc.id },
        },
      },
    });
    await this.prisma.$transaction([
      ...outros.map((o) => this.prisma.procedimentoModelo.delete({ where: { id: o.id } })),
      this.prisma.procedimentoModelo.upsert({
        where: { procedimentoId_modeloId: { procedimentoId: proc.id, modeloId } },
        create: { procedimentoId: proc.id, modeloId },
        update: {},
      }),
    ]);
    return this.prisma.procedimentoLaudo.findUnique({
      where: { id: proc.id },
      include: { modelos: { include: { modelo: true } } },
    });
  }

  /** Crit. 9: plano passa a referenciar o procedimento por FK; `procedimentoCodigo` não é tocado. */
  async vincularPlano(user: AuthUser, id: string, planoTesteId: string) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const proc = await this.findOwned(user.estabelecimentoId, id);
    this.assertVinculavel(proc, await this.ehProcLegado(proc.id));
    const plano = await this.prisma.planoTeste.findFirst({
      where: { id: planoTesteId, tipoEquipamentoPlano: { estabelecimentoId: user.estabelecimentoId } },
    });
    if (!plano) throw new NotFoundException("Plano não encontrado");
    if (String(plano.tipoTeste) !== String(proc.tipo)) throw new BadRequestException("Tipo do plano diferente do tipo do procedimento");
    return this.prisma.planoTeste.update({ where: { id: plano.id }, data: { procedimentoId: proc.id } });
  }

  /** Q3: pai do mesmo estabelecimento, cadeia ≤ 3 níveis, sem ciclo. */
  private async validarPai(estabelecimentoId: string, id: string | null, paiId: string) {
    const todos = await this.prisma.procedimentoLaudo.findMany({
      where: { estabelecimentoId },
      select: { id: true, paiId: true },
    });
    if (!todos.some((t) => t.id === paiId)) throw new BadRequestException("Procedimento pai não encontrado");
    const paiDe = new Map(todos.map((t) => [t.id, t.paiId]));
    const r = verificarCadeiaPais(id ?? "__novo__", paiId, (x) => paiDe.get(x) ?? null);
    if (!r.ok) throw new BadRequestException(r.erro);
  }

  private async assertCodigoLivre(estabelecimentoId: string, codigo: string, proprio: string | null) {
    if (!codigo) throw new BadRequestException("Informe o código do procedimento.");
    const outro = await this.prisma.procedimentoLaudo.findFirst({
      where: { estabelecimentoId, codigo, ...(proprio ? { NOT: { id: proprio } } : {}) },
      select: { id: true },
    });
    if (outro) throw new ConflictException(`Código ${codigo} já é usado por outro procedimento`);
  }

  private mapUnique(e: unknown, codigo: string): never {
    const err = e as { code?: string; meta?: { target?: unknown } };
    if (err?.code === "P2002") {
      const alvo = JSON.stringify(err.meta?.target ?? "");
      if (alvo.includes("codigo")) throw new ConflictException(`Código ${codigo} já é usado por outro procedimento`);
      throw new ConflictException("Conflito de publicação; recarregue");
    }
    throw e;
  }

  private async autorNome(user: AuthUser) {
    const u = await this.prisma.usuario.findUnique({ where: { id: user.userId }, select: { nome: true } });
    return u?.nome || user.email;
  }

  private async findOwned(estabelecimentoId: string, id: string) {
    const proc = await this.prisma.procedimentoLaudo.findFirst({ where: { id, estabelecimentoId } });
    if (!proc) throw new NotFoundException("Procedimento não encontrado");
    return proc;
  }
}
