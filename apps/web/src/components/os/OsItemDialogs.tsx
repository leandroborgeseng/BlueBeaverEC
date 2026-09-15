"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { labelResponsavel } from "@/lib/session";
import {
  Cabecalho,
  Combo,
  Historico,
  Linha,
  Overlay,
  WinForm,
  YELLOW,
  fld,
  fmt,
  isoDate,
  radio,
  table,
  td,
  th,
  type OsDialogCtx,
} from "./os-win-ui";
export type { OsDialogCtx } from "./os-win-ui";

export type OsItemMeta = {
  kind?: string;
  ocorrencia?: string;
  causa?: string;
  servico?: string;
  data?: string;
  dataSolucao?: string;
  tipoAlocacao?: "INTERNO" | "EXTERNO";
  observacao?: string;
  tecnicoId?: string;
  tecnicoNome?: string;
  inicio?: string;
  horaInicio?: string;
  termino?: string;
  horaFim?: string;
  valorHora?: number;
  tempoDeslocamento?: string;
  custoDeslocamento?: number;
  resolvida?: boolean;
  dataSaida?: string;
  almoxarifado?: string;
  produto?: string;
  unidade?: string;
  notaFiscal?: string;
  serie?: string;
  codigo?: string;
  prazo?: string;
};

export type OsLancamento = {
  id: string;
  tipo: string;
  descricao: string;
  quantidade: number;
  valorUnitario?: number | null;
  origemMaterial?: string | null;
  meta?: OsItemMeta | null;
  createdAt?: string;
};

type Colab = { id: string; nome: string; funcao?: string | null; cargo?: string | null };

type Peca = { codigo: string; descricao: string; disponivel: number; unidade?: string; almoxarifado?: string };

export function OsItemDialogs({
  open,
  ctx,
  itens,
  colaboradores,
  pecas,
  aberturaChamado,
  onClose,
  onSaved,
}: {
  open: "ocorrencia" | "mao" | "material" | null;
  ctx: OsDialogCtx;
  itens: OsLancamento[];
  colaboradores: Colab[];
  pecas: Peca[];
  aberturaChamado?: { descricao: string; em: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      {open === "ocorrencia" && (
        <DialogOcorrencia ctx={ctx} itens={itens} aberturaChamado={aberturaChamado} onClose={onClose} onSaved={onSaved} />
      )}
      {open === "mao" && (
        <DialogMao
          ctx={ctx}
          itens={itens}
          colaboradores={colaboradores}
          aberturaChamado={aberturaChamado}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
      {open === "material" && (
        <DialogMaterial ctx={ctx} itens={itens} pecas={pecas} onClose={onClose} onSaved={onSaved} />
      )}
    </Overlay>
  );
}

function DialogOcorrencia({
  ctx,
  itens,
  aberturaChamado,
  onClose,
  onSaved,
}: {
  ctx: OsDialogCtx;
  itens: OsLancamento[];
  aberturaChamado?: { descricao: string; em: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const hist = useMemo(() => {
    const rows = itens.filter((i) => i.tipo === "OUTROS_DIRETOS" && i.meta?.kind === "OCORRENCIA");
    const extra = aberturaChamado
      ? [
          {
            ocorrencia: aberturaChamado.descricao || "ABERTURA DE CHAMADO",
            abertura: aberturaChamado.em,
            causa: "NÃO INFORMADA",
            externo: "NÃO INFORMADO",
            dataHora: "",
            tipo: "INTERNO",
          },
        ]
      : [];
    return [
      ...extra,
      ...rows.map((i) => ({
        ocorrencia: i.meta?.ocorrencia || i.descricao,
        abertura: i.meta?.data || "",
        causa: i.meta?.causa || "NÃO INFORMADA",
        externo: i.meta?.tipoAlocacao === "EXTERNO" ? i.meta?.servico || "SIM" : "NÃO INFORMADO",
        dataHora: i.meta?.dataSolucao || "",
        tipo: i.meta?.tipoAlocacao || "INTERNO",
      })),
    ];
  }, [itens, aberturaChamado]);

  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [ocorrencia, setOcorrencia] = useState("");
  const [causa, setCausa] = useState("");
  const [servico, setServico] = useState("");
  const [dataSolucao, setDataSolucao] = useState("");
  const [tipo, setTipo] = useState<"INTERNO" | "EXTERNO">("INTERNO");
  const [obs, setObs] = useState("");
  const [continuar, setContinuar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const opcoesOcorrencia = useMemo(
    () => Array.from(new Set(["ABERTURA DE CHAMADO", ...hist.map((h) => h.ocorrencia).filter(Boolean)])),
    [hist],
  );
  const opcoesCausa = useMemo(() => Array.from(new Set(hist.map((h) => h.causa).filter((c) => c && c !== "NÃO INFORMADA"))), [hist]);
  const opcoesServico = useMemo(() => Array.from(new Set(itens.map((i) => i.meta?.servico).filter((s): s is string => Boolean(s)))), [itens]);

  function limpar() {
    setData("");
    setHora("");
    setOcorrencia("");
    setCausa("");
    setServico("");
    setDataSolucao("");
    setTipo("INTERNO");
    setObs("");
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!ocorrencia.trim()) {
      setErro("Informe a ocorrência.");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await api(`/os/${ctx.numero}/execucao`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(servico.trim() ? { servicoRealizado: servico.trim() } : {}),
          ...(obs.trim() ? { diagnostico: obs.trim() } : {}),
          itens: [
            {
              tipo: "OUTROS_DIRETOS",
              descricao: ocorrencia.trim(),
              quantidade: 1,
              meta: {
                kind: "OCORRENCIA",
                ocorrencia: ocorrencia.trim(),
                causa: causa.trim(),
                servico: servico.trim(),
                data: data && hora ? `${data}T${hora}` : data,
                dataSolucao,
                tipoAlocacao: tipo,
                observacao: obs.trim(),
              },
            },
          ],
        }),
      });
      await onSaved();
      if (continuar) limpar();
      else onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinForm title={`OS ${ctx.codigo.replace(/^OS-/, "")}`} onSubmit={salvar} onCancel={onClose} busy={busy} continuar={continuar} setContinuar={setContinuar} erro={erro}>
      <Cabecalho ctx={ctx} />
      <Linha label="Data:">
        <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={{ ...fld, width: 130, background: YELLOW }} />
        <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ ...fld, width: 90, background: YELLOW, marginLeft: 6 }} />
      </Linha>
      <Linha label="Ocorrência:">
        <Combo value={ocorrencia} onChange={setOcorrencia} options={opcoesOcorrencia} yellow />
      </Linha>
      <Linha label="Causa:">
        <Combo value={causa} onChange={setCausa} options={opcoesCausa} />
      </Linha>
      <Linha label="Serviço:">
        <Combo value={servico} onChange={setServico} options={opcoesServico} />
      </Linha>
      <Linha label="Data da Solução:">
        <input type="date" value={dataSolucao} onChange={(e) => setDataSolucao(e.target.value)} style={{ ...fld, width: 130 }} />
        <span style={{ marginLeft: 16, fontSize: 12 }}>Tipo:</span>
        <label style={radio}>
          <input type="radio" checked={tipo === "INTERNO"} onChange={() => setTipo("INTERNO")} /> Interno
        </label>
        <label style={radio}>
          <input type="radio" checked={tipo === "EXTERNO"} onChange={() => setTipo("EXTERNO")} /> Externo
        </label>
      </Linha>
      <Linha label="Observação:" align="start">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} style={{ ...fld, flex: 1, height: 64, resize: "vertical" }} />
      </Linha>
      <Historico titulo="Histórico das ocorrências/serviços realizados nesta OS:" count={hist.length}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Ocorrência</th>
              <th style={th}>Data/Hora de Abertura</th>
              <th style={th}>Causa</th>
              <th style={th}>Serviços Externos</th>
              <th style={th}>Data/Hora</th>
              <th style={th}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {hist.map((h, i) => (
              <tr key={i}>
                <td style={td}>{h.ocorrencia}</td>
                <td style={td}>{fmt(h.abertura)}</td>
                <td style={td}>{h.causa}</td>
                <td style={td}>{h.externo}</td>
                <td style={td}>{fmt(h.dataHora)}</td>
                <td style={td}>{h.tipo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Historico>
    </WinForm>
  );
}

function DialogMao({
  ctx,
  itens,
  colaboradores,
  aberturaChamado,
  onClose,
  onSaved,
}: {
  ctx: OsDialogCtx;
  itens: OsLancamento[];
  colaboradores: Colab[];
  aberturaChamado?: { descricao: string; em: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const hist = itens.filter((i) => i.tipo === "MAO_DE_OBRA");
  const hoje = isoDate();
  const [tecnicoId, setTecnicoId] = useState(ctx.responsavelId || "");
  const [inicio, setInicio] = useState(hoje);
  const [horaInicio, setHoraInicio] = useState("");
  const [termino, setTermino] = useState(hoje);
  const [horaFim, setHoraFim] = useState("");
  const [valorHora, setValorHora] = useState("0,00");
  const [tempoDesloc, setTempoDesloc] = useState("");
  const [custoDesloc, setCustoDesloc] = useState("");
  const [ocorrencia, setOcorrencia] = useState(aberturaChamado?.descricao || "ABERTURA DE CHAMADO");
  const [causa, setCausa] = useState("");
  const [servico, setServico] = useState("");
  const [resolvida, setResolvida] = useState(false);
  const [obs, setObs] = useState("");
  const [continuar, setContinuar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const opcoesOcorrencia = useMemo(
    () =>
      Array.from(
        new Set(
          [
            aberturaChamado?.descricao || "ABERTURA DE CHAMADO",
            ...itens.map((i) => i.meta?.ocorrencia).filter((s): s is string => Boolean(s)),
          ].filter(Boolean),
        ),
      ),
    [itens, aberturaChamado],
  );

  function limpar() {
    setHoraInicio("");
    setHoraFim("");
    setTempoDesloc("");
    setCustoDesloc("");
    setCausa("");
    setServico("");
    setResolvida(false);
    setObs("");
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!tecnicoId) {
      setErro("Informe o técnico.");
      return;
    }
    const colab = colaboradores.find((c) => c.id === tecnicoId);
    const horas = horasEntre(inicio, horaInicio, termino, horaFim);
    const vh = parseBr(valorHora);
    setBusy(true);
    setErro(null);
    try {
      await api(`/os/${ctx.numero}/execucao`, {
        method: "PATCH",
        body: JSON.stringify({
          itens: [
            {
              tipo: "MAO_DE_OBRA",
              descricao: colab ? labelResponsavel(colab) : "Mão de obra",
              quantidade: horas,
              valorUnitario: vh > 0 ? vh : undefined,
              meta: {
                kind: "MAO",
                tecnicoId,
                tecnicoNome: colab ? labelResponsavel(colab) : "",
                inicio,
                horaInicio,
                termino,
                horaFim,
                valorHora: vh,
                tempoDeslocamento: tempoDesloc,
                custoDeslocamento: parseBr(custoDesloc),
                ocorrencia,
                causa,
                servico,
                resolvida,
                observacao: obs.trim(),
              },
            },
          ],
        }),
      });
      await onSaved();
      if (continuar) limpar();
      else onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinForm title={`OS ${ctx.codigo.replace(/^OS-/, "")}`} onSubmit={salvar} onCancel={onClose} busy={busy} continuar={continuar} setContinuar={setContinuar} erro={erro}>
      <Cabecalho ctx={ctx} />
      <Linha label="Técnico:">
        <select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} style={{ ...fld, flex: 1, background: YELLOW }}>
          <option value="">Selecione…</option>
          {colaboradores.map((c) => (
            <option key={c.id} value={c.id}>
              {labelResponsavel(c)}
            </option>
          ))}
        </select>
      </Linha>
      <Linha label="Início do Serviço:">
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} style={{ ...fld, width: 130, background: YELLOW }} />
        <span style={{ fontSize: 12, marginLeft: 8 }}>Hora:</span>
        <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} style={{ ...fld, width: 90, background: YELLOW, marginLeft: 4 }} />
        <span style={{ fontSize: 12, marginLeft: 12 }}>Término do Serviço:</span>
        <input type="date" value={termino} onChange={(e) => setTermino(e.target.value)} style={{ ...fld, width: 130, marginLeft: 4 }} />
        <span style={{ fontSize: 12, marginLeft: 8 }}>Hora:</span>
        <input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} style={{ ...fld, width: 90, marginLeft: 4 }} />
        <span style={{ fontSize: 12, marginLeft: 12 }}>Valor da Hora Técnica:</span>
        <input value={valorHora} onChange={(e) => setValorHora(e.target.value)} style={{ ...fld, width: 80, marginLeft: 4 }} />
      </Linha>
      <Linha label="Tempo de Deslocamento:">
        <input value={tempoDesloc} onChange={(e) => setTempoDesloc(e.target.value)} style={{ ...fld, width: 90 }} />
        <span style={{ fontSize: 12, marginLeft: 12 }}>Custo de Deslocamento:</span>
        <input value={custoDesloc} onChange={(e) => setCustoDesloc(e.target.value)} style={{ ...fld, width: 90, marginLeft: 4 }} />
      </Linha>
      <Linha label="Ocorrência:">
        <Combo value={ocorrencia} onChange={setOcorrencia} options={opcoesOcorrencia} />
      </Linha>
      <Linha label="Causa:">
        <Combo value={causa} onChange={setCausa} options={[]} />
      </Linha>
      <Linha label="Serviço:">
        <Combo value={servico} onChange={setServico} options={[]} />
      </Linha>
      <Linha label="">
        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={resolvida} onChange={(e) => setResolvida(e.target.checked)} />
          A ocorrência foi resolvida com este serviço
        </label>
      </Linha>
      <Linha label="Observações:" align="start">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} style={{ ...fld, flex: 1, height: 64 }} />
      </Linha>
      <Historico titulo="Histórico das mãos de obras realizados nesta OS:" count={hist.length}>
        {hist.length === 0 ? null : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Técnico</th>
                <th style={th}>Início</th>
                <th style={th}>Término</th>
                <th style={th}>Horas</th>
                <th style={th}>Ocorrência</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((i) => (
                <tr key={i.id}>
                  <td style={td}>{i.meta?.tecnicoNome || i.descricao}</td>
                  <td style={td}>
                    {i.meta?.inicio} {i.meta?.horaInicio}
                  </td>
                  <td style={td}>
                    {i.meta?.termino} {i.meta?.horaFim}
                  </td>
                  <td style={td}>{i.quantidade}</td>
                  <td style={td}>{i.meta?.ocorrencia || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Historico>
    </WinForm>
  );
}

function DialogMaterial({
  ctx,
  itens,
  pecas,
  onClose,
  onSaved,
}: {
  ctx: OsDialogCtx;
  itens: OsLancamento[];
  pecas: Peca[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const hist = itens.filter((i) => i.tipo === "MATERIAL");
  const [dataSaida, setDataSaida] = useState(isoDate());
  const [almox, setAlmox] = useState("");
  const [produto, setProduto] = useState("");
  const [qtd, setQtd] = useState("");
  const [nf, setNf] = useState("");
  const [serie, setSerie] = useState("");
  const [obs, setObs] = useState("");
  const [continuar, setContinuar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const almoxes = useMemo(
    () => Array.from(new Set(pecas.map((p) => p.almoxarifado).filter((a): a is string => Boolean(a)))),
    [pecas],
  );

  const peca = acharPeca(pecas, produto);
  const unidade = peca?.unidade || (produto ? "UN" : "");
  const almoxNome = almox || peca?.almoxarifado || "";
  const produtoPronto = Boolean(produto.trim());

  function limpar() {
    setProduto("");
    setQtd("");
    setNf("");
    setSerie("");
    setObs("");
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!produto.trim()) {
      setErro("Informe o produto.");
      return;
    }
    const quantidade = Number(String(qtd).replace(",", ".") || 0);
    if (!quantidade || quantidade <= 0) {
      setErro("Informe a quantidade.");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await api(`/os/${ctx.numero}/execucao`, {
        method: "PATCH",
        body: JSON.stringify({
          itens: [
            {
              tipo: "MATERIAL",
              descricao: peca?.descricao || produto.trim(),
              itemCodigo: peca ? peca.codigo : undefined,
              quantidade,
              origemMaterial: peca ? "ESTOQUE" : "COMPRA_DIRETA",
              meta: {
                kind: "MATERIAL",
                dataSaida,
                almoxarifado: almoxNome,
                produto: peca?.descricao || produto.trim(),
                unidade: unidade || "UN",
                notaFiscal: nf,
                serie,
                observacao: obs.trim(),
              },
            },
          ],
        }),
      });
      await onSaved();
      if (continuar) limpar();
      else onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinForm title={`OS ${ctx.codigo.replace(/^OS-/, "")}`} onSubmit={salvar} onCancel={onClose} busy={busy} continuar={continuar} setContinuar={setContinuar} erro={erro}>
      <Cabecalho ctx={ctx} numeroLabel="Número da OS:" />
      <Linha label="Data da Saída:">
        <input type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} style={{ ...fld, width: 140, background: YELLOW }} />
      </Linha>
      <Linha label="Almoxarifado:">
        <input
          value={almox || peca?.almoxarifado || ""}
          onChange={(e) => setAlmox(e.target.value)}
          style={{ ...fld, width: 90, background: YELLOW }}
        />
        <Combo value={almoxNome} onChange={setAlmox} options={almoxes} yellow />
      </Linha>
      <Linha label="Produto:">
        <Combo
          value={produto}
          onChange={(v) => {
            const p = acharPeca(pecas, v);
            setProduto(p ? p.codigo : v);
            if (p?.almoxarifado) setAlmox(p.almoxarifado);
          }}
          options={pecas.map((p) => `${p.codigo} — ${p.descricao}`)}
          yellow
        />
      </Linha>
      <Linha label="Unidade:">
        <input readOnly value={unidade} style={{ ...fld, width: 70, background: produtoPronto ? "white" : "#ddd" }} />
        <span style={{ fontSize: 12, marginLeft: 12 }}>Quantidade:</span>
        <input
          value={qtd}
          disabled={!produtoPronto}
          onChange={(e) => setQtd(e.target.value)}
          style={{ ...fld, width: 80, marginLeft: 4, background: produtoPronto ? "white" : "#ddd" }}
        />
        <span style={{ fontSize: 12, marginLeft: 24 }}>Nota Fiscal:</span>
        <input value={nf} onChange={(e) => setNf(e.target.value)} style={{ ...fld, width: 110, marginLeft: 4 }} />
        <span style={{ fontSize: 12, marginLeft: 12 }}>Série:</span>
        <input value={serie} onChange={(e) => setSerie(e.target.value)} style={{ ...fld, width: 70, marginLeft: 4 }} />
      </Linha>
      <Linha label="Observações:" align="start">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} style={{ ...fld, flex: 1, height: 70 }} />
      </Linha>
      <Historico titulo="Histórico dos produtos consumidos por esta ordem de serviço" count={hist.length}>
        {hist.length === 0 ? null : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Produto</th>
                <th style={th}>Qtd</th>
                <th style={th}>Almoxarifado</th>
                <th style={th}>NF</th>
                <th style={th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((i) => (
                <tr key={i.id}>
                  <td style={td}>{i.meta?.produto || i.descricao}</td>
                  <td style={td}>{i.quantidade}</td>
                  <td style={td}>{i.meta?.almoxarifado || ""}</td>
                  <td style={td}>{i.meta?.notaFiscal || ""}</td>
                  <td style={td}>{i.meta?.dataSaida || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Historico>
    </WinForm>
  );
}

function acharPeca(pecas: Peca[], valor: string) {
  const v = valor.trim();
  if (!v) return undefined;
  return (
    pecas.find((p) => p.codigo === v) ||
    pecas.find((p) => `${p.codigo} — ${p.descricao}` === v) ||
    pecas.find((p) => p.descricao.toLowerCase() === v.toLowerCase())
  );
}

function horasEntre(d1: string, h1: string, d2: string, h2: string) {
  if (!d1 || !d2) return 1;
  const a = new Date(`${d1}T${h1 || "00:00"}:00`);
  const b = new Date(`${d2}T${h2 || "00:00"}:00`);
  const h = (b.getTime() - a.getTime()) / 36e5;
  if (!Number.isFinite(h) || h <= 0) return 1;
  return Math.round(h * 100) / 100;
}

function parseBr(v: string) {
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
