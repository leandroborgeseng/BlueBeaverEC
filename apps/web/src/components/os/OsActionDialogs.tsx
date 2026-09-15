"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from "react";
import { api, downloadApi } from "@/lib/api";
import { filesToAnexos } from "@/lib/os-ui";
import { useSession } from "@/lib/session";
import type { OsDialogCtx, OsLancamento } from "./OsItemDialogs";
import {
  BlueBtn,
  Cabecalho,
  Combo,
  DateHora,
  Historico,
  Linha,
  Overlay,
  SectionTitle,
  WinForm,
  YELLOW,
  disabledFld,
  fld,
  fmt,
  isoDate,
  isoTime,
  radio,
  saveBtn,
  table,
  td,
  th,
} from "./os-win-ui";

type Anexo = { id: string; nomeArquivo: string; mimeType?: string; visibilidade?: string; createdAt?: string };
type Fornecedor = { id: string; nome: string };
type Proc = { id: string; nome: string; tipo?: string; versao?: number };
type Pop = { id: string; codigo: string; titulo: string; versao?: string };

const SIG_KEY = "aion_minha_assinatura";

export function OsActionDialogs({
  open,
  ctx,
  itens,
  anexos,
  osTipo,
  equipamentoTag,
  hospitalNome,
  slaAtendimento,
  slaSolucao,
  onClose,
  onSaved,
  onOpenChecklist,
}: {
  open: "pendencia" | "externo-item" | "procedimento" | "foto" | "assinatura" | "anexos" | null;
  ctx: OsDialogCtx;
  itens: OsLancamento[];
  anexos: Anexo[];
  osTipo?: string;
  equipamentoTag?: string;
  hospitalNome?: string;
  slaAtendimento?: string;
  slaSolucao?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onOpenChecklist: (procedimentoId?: string) => void;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      {open === "pendencia" && <DialogPendencia ctx={ctx} itens={itens} onClose={onClose} onSaved={onSaved} />}
      {open === "externo-item" && (
        <DialogExterno
          ctx={ctx}
          itens={itens}
          slaAtendimento={slaAtendimento}
          slaSolucao={slaSolucao}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
      {open === "procedimento" && (
        <DialogProcedimento
          ctx={ctx}
          itens={itens}
          osTipo={osTipo}
          equipamentoTag={equipamentoTag}
          hospitalNome={hospitalNome}
          onClose={onClose}
          onSaved={onSaved}
          onOpenChecklist={onOpenChecklist}
        />
      )}
      {open === "foto" && <DialogFoto ctx={ctx} onClose={onClose} onSaved={onSaved} />}
      {open === "assinatura" && <DialogAssinatura ctx={ctx} onClose={onClose} onSaved={onSaved} />}
      {open === "anexos" && <DialogAnexos ctx={ctx} anexos={anexos} onClose={onClose} onSaved={onSaved} />}
    </Overlay>
  );
}

function DialogPendencia({
  ctx,
  itens,
  onClose,
  onSaved,
}: {
  ctx: OsDialogCtx;
  itens: OsLancamento[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const hist = itens.filter((i) => i.meta?.kind === "PENDENCIA" || (i.tipo === "OUTROS_DIRETOS" && i.meta?.kind === "PENDENCIA"));
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [abertaData, setAbertaData] = useState(isoDate());
  const [abertaHora, setAbertaHora] = useState(isoTime());
  const [prazoData, setPrazoData] = useState("");
  const [prazoHora, setPrazoHora] = useState("");
  const [fechadaData, setFechadaData] = useState("");
  const [fechadaHora, setFechadaHora] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const opcoes = useMemo(
    () => Array.from(new Set(hist.map((i) => i.meta?.ocorrencia || i.descricao).filter(Boolean))),
    [hist],
  );

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const desc = nome.trim() || codigo.trim();
    if (!desc) {
      setErro("Informe a pendência.");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await api(`/os/${ctx.numero}/execucao`, {
        method: "PATCH",
        body: JSON.stringify({
          pendencia: fechadaData ? null : desc,
          itens: [
            {
              tipo: "OUTROS_DIRETOS",
              descricao: desc,
              quantidade: 1,
              meta: {
                kind: "PENDENCIA",
                codigo,
                ocorrencia: desc,
                data: `${abertaData}T${abertaHora || "00:00"}`,
                prazo: prazoData,
                dataSolucao: fechadaData,
                observacao: obs.trim(),
              },
            },
          ],
        }),
      });
      await onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinForm
      title={`OS ${ctx.codigo.replace(/^OS-/, "")}`}
      onSubmit={salvar}
      onCancel={onClose}
      busy={busy}
      erro={erro}
      showContinuar={false}
    >
      <Cabecalho ctx={ctx} />
      <Linha label="Pendência:">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} style={{ ...fld, width: 90, background: YELLOW }} />
        <Combo value={nome} onChange={setNome} options={opcoes} yellow />
      </Linha>
      <Linha label="Aberta em:">
        <DateHora date={abertaData} time={abertaHora} onDate={setAbertaData} onTime={setAbertaHora} yellow />
        <span style={{ fontSize: 12, marginLeft: 16 }}>Prazo de Conclusão:</span>
        <DateHora date={prazoData} time={prazoHora} onDate={setPrazoData} onTime={setPrazoHora} />
      </Linha>
      <Linha label="Fechada:">
        <DateHora date={fechadaData} time={fechadaHora} onDate={setFechadaData} onTime={setFechadaHora} />
      </Linha>
      <Linha label="Observação:" align="start">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} style={{ ...fld, flex: 1, height: 70, resize: "vertical" }} />
      </Linha>
      <Historico titulo="Histórico das pendências desta ordem de serviço:" count={hist.length}>
        {hist.length === 0 ? null : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>Pendência</th>
                <th style={th}>Aberta em</th>
                <th style={th}>Prazo</th>
                <th style={th}>Fechada</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((i) => (
                <tr key={i.id}>
                  <td style={td}>{i.meta?.ocorrencia || i.descricao}</td>
                  <td style={td}>{fmt(i.meta?.data)}</td>
                  <td style={td}>{fmt(String(i.meta?.prazo ?? ""))}</td>
                  <td style={td}>{fmt(i.meta?.dataSolucao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Historico>
    </WinForm>
  );
}

function DialogExterno({
  ctx,
  itens,
  slaAtendimento,
  slaSolucao,
  onClose,
  onSaved,
}: {
  ctx: OsDialogCtx;
  itens: OsLancamento[];
  slaAtendimento?: string;
  slaSolucao?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedor, setFornecedor] = useState("");
  const [chamadoData, setChamadoData] = useState("");
  const [chamadoHora, setChamadoHora] = useState("");
  const [primeiro, setPrimeiro] = useState<"INTERNO" | "EXTERNO">("INTERNO");
  const [necessitaExt, setNecessitaExt] = useState(false);
  const [prevAtend, setPrevAtend] = useState("");
  const [prevAtendHora, setPrevAtendHora] = useState("");
  const [atendimento, setAtendimento] = useState("");
  const [atendHora, setAtendHora] = useState("");
  const [prevConc, setPrevConc] = useState("");
  const [prevConcHora, setPrevConcHora] = useState("");
  const [saida, setSaida] = useState("");
  const [respExt, setRespExt] = useState("");
  const [cpf, setCpf] = useState("");
  const [retorno, setRetorno] = useState("");
  const [motivo, setMotivo] = useState("");
  const [acessorios, setAcessorios] = useState("");
  const [orcNec, setOrcNec] = useState(true);
  const [recebidoEm, setRecebidoEm] = useState("");
  const [valor, setValor] = useState("");
  const [orcStatus, setOrcStatus] = useState<"AGUARDANDO" | "NAO" | "APROVADO">("AGUARDANDO");
  const [orcData, setOrcData] = useState("");
  const [metodo, setMetodo] = useState("Mediante execução dos serviço");
  const [concData, setConcData] = useState("");
  const [concHora, setConcHora] = useState("");
  const [garantia, setGarantia] = useState("");
  const [nf, setNf] = useState("");
  const [emissao, setEmissao] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [ocorrencia, setOcorrencia] = useState("");
  const [causa, setCausa] = useState("");
  const [servico, setServico] = useState("");
  const [resolvida, setResolvida] = useState(false);
  const [avaliacao, setAvaliacao] = useState<"BOM" | "REGULAR" | "RUIM" | "">("");
  const [obs, setObs] = useState("");
  const [continuar, setContinuar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const extOn = necessitaExt || primeiro === "EXTERNO";
  const extFld: CSSProperties = extOn ? fld : disabledFld;

  useEffect(() => {
    api<Fornecedor[]>("/fornecedores")
      .then((r) => setFornecedores(Array.isArray(r) ? r : []))
      .catch(() => undefined);
  }, []);

  function limpar() {
    setChamadoData("");
    setValor("");
    setObs("");
    setServico("");
    setCausa("");
  }

  async function persistir() {
    const forn = fornecedores.find((f) => f.nome === fornecedor || f.id === fornecedor);
    const desc = servico.trim() || fornecedor.trim() || "Serviço externo";
    await api(`/os/${ctx.numero}/execucao`, {
      method: "PATCH",
      body: JSON.stringify({
        itens: [
          {
            tipo: "SERVICO_EXTERNO",
            descricao: desc,
            quantidade: 1,
            valorUnitario: Number(String(valor).replace(/\./g, "").replace(",", ".")) || undefined,
            meta: {
              kind: "SERVICO_EXTERNO",
              fornecedor,
              chamado: chamadoData,
              primeiroAtendimento: primeiro,
              necessitaExterno: necessitaExt,
              previsaoAtendimento: prevAtend,
              previsaoConclusao: prevConc,
              atendimento,
              saida,
              responsavelExterno: respExt,
              cpf,
              retorno,
              motivo,
              acessorios,
              orcamentoNecessario: orcNec,
              recebidoEm,
              orcStatus,
              orcData,
              metodo,
              concluidoEm: concData,
              garantia,
              notaFiscal: nf,
              emissao,
              vencimento,
              ocorrencia,
              causa,
              servico,
              resolvida,
              avaliacao,
              observacao: obs.trim(),
            },
          },
        ],
      }),
    });
    if (forn && necessitaExt) {
      try {
        await api(`/os/${ctx.numero}/atendimento-externo`, {
          method: "POST",
          body: JSON.stringify({ fornecedorId: forn.id, observacoes: obs.trim() || undefined }),
        });
      } catch {
        /* já pode existir encaminhamento aberto */
      }
    }
  }

  async function salvar(e: FormEvent, fechar = false) {
    e.preventDefault();
    setBusy(true);
    setErro(null);
    try {
      await persistir();
      await onSaved();
      if (fechar || !continuar) onClose();
      else limpar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  const osNum = ctx.codigo.replace(/^OS-/, "");
  return (
    <WinForm
      title={`OS ${osNum}`}
      onSubmit={(e) => void salvar(e, false)}
      onCancel={onClose}
      busy={busy}
      erro={erro}
      continuar={continuar}
      setContinuar={setContinuar}
      onSubmitAndClose={() => void salvar({ preventDefault() {} } as FormEvent, true)}
      width="min(1100px, 100%)"
    >
      <Cabecalho ctx={ctx} />
      <Linha label="Fornecedor:">
        <input value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} style={{ ...fld, width: 90, background: YELLOW }} />
        <Combo value={fornecedor} onChange={setFornecedor} options={fornecedores.map((f) => f.nome)} yellow />
      </Linha>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <Linha label="Chamado:">
          <DateHora date={chamadoData} time={chamadoHora} onDate={setChamadoData} onTime={setChamadoHora} />
        </Linha>
        <span style={{ fontSize: 12, marginLeft: 8 }}>Primeiro Atendimento:</span>
        <label style={radio}>
          <input type="radio" checked={primeiro === "INTERNO"} onChange={() => setPrimeiro("INTERNO")} /> Interno
        </label>
        <label style={radio}>
          <input type="radio" checked={primeiro === "EXTERNO"} onChange={() => setPrimeiro("EXTERNO")} /> Externo
        </label>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12 }}>Previsão para Atendimento:</span>
        <DateHora date={prevAtend} time={prevAtendHora} onDate={setPrevAtend} onTime={setPrevAtendHora} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <Linha label="Atendimento:">
          <DateHora date={atendimento} time={atendHora} onDate={setAtendimento} onTime={setAtendHora} />
        </Linha>
        <label style={{ ...radio, marginLeft: 8 }}>
          <input type="checkbox" checked={necessitaExt} onChange={(e) => setNecessitaExt(e.target.checked)} /> Necessita de atendimento
          externo
        </label>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12 }}>Previsão de Conclusão:</span>
        <DateHora date={prevConc} time={prevConcHora} onDate={setPrevConc} onTime={setPrevConcHora} />
      </div>

      <SectionTitle>Saída do Equipamento (Atendimentos Externos)</SectionTitle>
      <Linha label="Saída:">
        <input value={saida} disabled={!extOn} onChange={(e) => setSaida(e.target.value)} style={{ ...extFld, width: 140 }} />
        <span style={{ fontSize: 12, marginLeft: 12 }}>Responsável:</span>
        <input value={respExt} disabled={!extOn} onChange={(e) => setRespExt(e.target.value)} style={{ ...extFld, flex: 1, marginLeft: 4 }} />
        <span style={{ fontSize: 12, marginLeft: 12 }}>CPF:</span>
        <input value={cpf} disabled={!extOn} onChange={(e) => setCpf(e.target.value)} style={{ ...extFld, width: 130, marginLeft: 4 }} />
      </Linha>
      <Linha label="Retorno:">
        <input value={retorno} disabled={!extOn} onChange={(e) => setRetorno(e.target.value)} style={{ ...extFld, width: 140 }} />
        <span style={{ fontSize: 12, marginLeft: 12 }}>Motivo:</span>
        <input value={motivo} disabled={!extOn} onChange={(e) => setMotivo(e.target.value)} style={{ ...extFld, flex: 1, marginLeft: 4 }} />
      </Linha>
      <Linha label="Acessórios:" align="start">
        <textarea value={acessorios} disabled={!extOn} onChange={(e) => setAcessorios(e.target.value)} rows={2} style={{ ...extFld, flex: 1, height: 40 }} />
      </Linha>

      <Linha label="Orçamento Necessário:">
        <label style={radio}>
          <input type="radio" checked={orcNec} onChange={() => setOrcNec(true)} /> Sim
        </label>
        <label style={radio}>
          <input type="radio" checked={!orcNec} onChange={() => setOrcNec(false)} /> Não
        </label>
      </Linha>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <Linha label="Recebido em:">
          <input type="date" value={recebidoEm} onChange={(e) => setRecebidoEm(e.target.value)} style={{ ...fld, width: 130 }} />
        </Linha>
        <span style={{ fontSize: 12 }}>Valor:</span>
        <input value={valor} onChange={(e) => setValor(e.target.value)} style={{ ...fld, width: 90, background: YELLOW }} />
        <label style={radio}>
          <input type="radio" checked={orcStatus === "AGUARDANDO"} onChange={() => setOrcStatus("AGUARDANDO")} /> Aguardando Aprovação
        </label>
        <label style={radio}>
          <input type="radio" checked={orcStatus === "NAO"} onChange={() => setOrcStatus("NAO")} /> Não Aprovado
        </label>
        <label style={radio}>
          <input type="radio" checked={orcStatus === "APROVADO"} onChange={() => setOrcStatus("APROVADO")} /> Aprovado
        </label>
        <span style={{ fontSize: 12 }}>Data:</span>
        <input type="date" value={orcData} onChange={(e) => setOrcData(e.target.value)} style={{ ...fld, width: 130 }} />
      </div>
      <Linha label="Método de Apropriação de Custos:">
        <select value={metodo} onChange={(e) => setMetodo(e.target.value)} style={{ ...fld, width: 260 }}>
          <option>Mediante execução dos serviço</option>
          <option>Nota fiscal</option>
          <option>Contrato</option>
        </select>
      </Linha>

      <SectionTitle>Concluído em:</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <Linha label="Data/Hora:">
          <DateHora date={concData} time={concHora} onDate={setConcData} onTime={setConcHora} />
        </Linha>
        <span style={{ fontSize: 12 }}>Garantia até:</span>
        <input type="date" value={garantia} onChange={(e) => setGarantia(e.target.value)} style={{ ...fld, width: 130 }} />
        <span style={{ fontSize: 12 }}>Nota Fiscal:</span>
        <input value={nf} onChange={(e) => setNf(e.target.value)} style={{ ...fld, width: 110 }} />
        <span style={{ fontSize: 12 }}>Emissão:</span>
        <input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} style={{ ...fld, width: 130 }} />
        <span style={{ fontSize: 12 }}>Vencimento:</span>
        <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} style={{ ...fld, width: 130 }} />
      </div>
      <Linha label="Ocorrência:">
        <Combo value={ocorrencia} onChange={setOcorrencia} options={itens.map((i) => i.meta?.ocorrencia || i.descricao)} />
      </Linha>
      <Linha label="Causa:">
        <Combo value={causa} onChange={setCausa} options={[]} />
      </Linha>
      <Linha label="Serviço:">
        <Combo value={servico} onChange={setServico} options={[]} />
      </Linha>
      <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "4px 0 8px 168px", fontSize: 12 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={resolvida} onChange={(e) => setResolvida(e.target.checked)} />
          A ocorrência foi resolvida com este serviço
        </label>
        <span>Avaliação do Serviço:</span>
        <label style={radio}>
          <input type="radio" checked={avaliacao === "BOM"} onChange={() => setAvaliacao("BOM")} /> Bom
        </label>
        <label style={radio}>
          <input type="radio" checked={avaliacao === "REGULAR"} onChange={() => setAvaliacao("REGULAR")} /> Regular
        </label>
        <label style={radio}>
          <input type="radio" checked={avaliacao === "RUIM"} onChange={() => setAvaliacao("RUIM")} /> Ruim
        </label>
      </div>
      <Linha label="Observação:" align="start">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} style={{ ...fld, flex: 1, height: 48 }} />
      </Linha>
      <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12, marginTop: 4 }}>
        <strong style={{ color: BLUE }}>▾ SLA:</strong>
        <span>Atendimento:</span>
        <span style={{ ...fld, width: 90, background: "#ddd", display: "inline-block" }}>{slaAtendimento ?? ""}</span>
        <span>Aguardando há:</span>
        <span style={{ color: "#1a7f37" }}>✓</span>
        <span>Solução:</span>
        <span style={{ ...fld, width: 90, background: "#ddd", display: "inline-block" }}>{slaSolucao ?? ""}</span>
        <span>Aguardando há:</span>
        <span style={{ color: "#1a7f37" }}>✓</span>
      </div>
    </WinForm>
  );
}

function DialogProcedimento({
  ctx,
  hospitalNome,
  onClose,
  onSaved,
  onOpenChecklist,
}: {
  ctx: OsDialogCtx;
  itens: OsLancamento[];
  osTipo?: string;
  equipamentoTag?: string;
  hospitalNome?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onOpenChecklist: (procedimentoId?: string) => void;
}) {
  const [procs, setProcs] = useState<Proc[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [filtro, setFiltro] = useState("PROCEDIMENTOS GENÉRICOS");
  const [codigo, setCodigo] = useState("");
  const [nome, setNome] = useState("");
  const [execData, setExecData] = useState(isoDate());
  const [execHora, setExecHora] = useState(isoTime());
  const [fornecedor, setFornecedor] = useState("<Nenhum>");
  const [cliNome, setCliNome] = useState(hospitalNome ?? "");
  const [cliCnpj, setCliCnpj] = useState("");
  const [cliPais, setCliPais] = useState("BRASIL");
  const [cliCep, setCliCep] = useState("");
  const [cliLogr, setCliLogr] = useState("");
  const [cliNum, setCliNum] = useState("");
  const [cliCompl, setCliCompl] = useState("");
  const [cliBairro, setCliBairro] = useState("");
  const [cliUf, setCliUf] = useState("");
  const [cliCidade, setCliCidade] = useState("");
  const [locNome, setLocNome] = useState(hospitalNome ?? "");
  const [locCnpj, setLocCnpj] = useState("");
  const [locPais, setLocPais] = useState("BRASIL");
  const [locCep, setLocCep] = useState("");
  const [locLogr, setLocLogr] = useState("");
  const [locNum, setLocNum] = useState("");
  const [locCompl, setLocCompl] = useState("");
  const [locBairro, setLocBairro] = useState("");
  const [locUf, setLocUf] = useState("");
  const [locCidade, setLocCidade] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Proc[]>("/procedimentos-laudo")
      .then((r) => setProcs(Array.isArray(r) ? r : []))
      .catch(() => undefined);
    api<Pop[]>("/estrategico/pops")
      .then((r) => setPops(Array.isArray(r) ? r : []))
      .catch(() => undefined);
    api<{ nome?: string; cnpj?: string }>("/config/organizacao")
      .then((o) => {
        if (o.nome) {
          setCliNome((v) => v || o.nome || "");
          setLocNome((v) => v || o.nome || "");
        }
        if (o.cnpj) {
          setCliCnpj(o.cnpj);
          setLocCnpj(o.cnpj);
        }
      })
      .catch(() => undefined);
  }, []);

  const procSel = procs.find((p) => p.nome === nome || p.id === codigo);
  const popSel = pops.find((p) => p.codigo === codigo || p.titulo === nome);

  async function persistir() {
    const desc = nome.trim() || codigo.trim() || "Procedimento";
    await api(`/os/${ctx.numero}/execucao`, {
      method: "PATCH",
      body: JSON.stringify({
        itens: [
          {
            tipo: "OUTROS_DIRETOS",
            descricao: desc,
            quantidade: 1,
            meta: {
              kind: "PROCEDIMENTO",
              codigo: popSel?.codigo || codigo,
              procedimentoId: procSel?.id,
              ocorrencia: desc,
              data: `${execData}T${execHora}`,
              fornecedor,
              observacao: obs.trim(),
              cliente: { nome: cliNome, cnpj: cliCnpj, pais: cliPais, cep: cliCep, logradouro: cliLogr, numero: cliNum, complemento: cliCompl, bairro: cliBairro, uf: cliUf, cidade: cliCidade },
              local: { nome: locNome, cnpj: locCnpj, pais: locPais, cep: locCep, logradouro: locLogr, numero: locNum, complemento: locCompl, bairro: locBairro, uf: locUf, cidade: locCidade },
            },
          },
        ],
      }),
    });
  }

  async function salvarEFechar() {
    setBusy(true);
    setErro(null);
    try {
      await persistir();
      await onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinForm
      title={`OS ${ctx.codigo.replace(/^OS-/, "")}`}
      onCancel={onClose}
      busy={busy}
      erro={erro}
      showContinuar={false}
      hideSubmit
      extraRight={
        <>
          <button
            type="button"
            style={saveBtn}
            onClick={() => {
              onOpenChecklist(procSel?.id);
            }}
          >
            Preencher CheckList
          </button>
          <button type="button" disabled={busy} style={saveBtn} onClick={() => void salvarEFechar()}>
            {busy ? "Salvando…" : "Salvar e Fechar"}
          </button>
        </>
      }
    >
      <Cabecalho ctx={ctx} />
      <Linha label="Filtro:">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ ...fld, width: 280, background: YELLOW }}>
          <option>PROCEDIMENTOS GENÉRICOS</option>
          <option>POPs</option>
          <option>Laudos</option>
        </select>
      </Linha>
      <Linha label="Procedimento:">
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          style={{ ...fld, width: 110, background: YELLOW }}
        />
        <Combo
          value={nome}
          onChange={(v) => {
            setNome(v);
            const pop = pops.find((p) => p.titulo === v || `${p.codigo} ${p.titulo}` === v);
            const proc = procs.find((p) => p.nome === v);
            if (pop) {
              setCodigo(pop.codigo);
              setNome(pop.titulo);
            } else if (proc) setNome(proc.nome);
          }}
          options={
            filtro === "POPs"
              ? pops.map((p) => `${p.codigo} ${p.titulo}`)
              : procs.map((p) => p.nome)
          }
          yellow
        />
        <span style={{ fontSize: 12, marginLeft: 12 }}>Execução:</span>
        <DateHora date={execData} time={execHora} onDate={setExecData} onTime={setExecHora} />
      </Linha>
      <Linha label="Fornecedor:">
        <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} style={{ ...fld, flex: 1 }}>
          <option>&lt;Nenhum&gt;</option>
        </select>
      </Linha>
      <SectionTitle>DADOS DO CLIENTE:</SectionTitle>
      <EnderecoBlock
        nome={cliNome}
        cnpj={cliCnpj}
        pais={cliPais}
        cep={cliCep}
        logr={cliLogr}
        num={cliNum}
        compl={cliCompl}
        bairro={cliBairro}
        uf={cliUf}
        cidade={cliCidade}
        onNome={setCliNome}
        onCnpj={setCliCnpj}
        onPais={setCliPais}
        onCep={setCliCep}
        onLogr={setCliLogr}
        onNum={setCliNum}
        onCompl={setCliCompl}
        onBairro={setCliBairro}
        onUf={setCliUf}
        onCidade={setCliCidade}
      />
      <SectionTitle>LOCAL DE EXECUÇÃO DO PROCEDIMENTO:</SectionTitle>
      <EnderecoBlock
        nome={locNome}
        cnpj={locCnpj}
        pais={locPais}
        cep={locCep}
        logr={locLogr}
        num={locNum}
        compl={locCompl}
        bairro={locBairro}
        uf={locUf}
        cidade={locCidade}
        onNome={setLocNome}
        onCnpj={setLocCnpj}
        onPais={setLocPais}
        onCep={setLocCep}
        onLogr={setLocLogr}
        onNum={setLocNum}
        onCompl={setLocCompl}
        onBairro={setLocBairro}
        onUf={setLocUf}
        onCidade={setLocCidade}
      />
      <Linha label="Observação:" align="start">
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} style={{ ...fld, flex: 1, height: 64 }} />
      </Linha>
    </WinForm>
  );
}

function EnderecoBlock({
  nome,
  cnpj,
  pais,
  cep,
  logr,
  num,
  compl,
  bairro,
  uf,
  cidade,
  onNome,
  onCnpj,
  onPais,
  onCep,
  onLogr,
  onNum,
  onCompl,
  onBairro,
  onUf,
  onCidade,
}: {
  nome: string;
  cnpj: string;
  pais: string;
  cep: string;
  logr: string;
  num: string;
  compl: string;
  bairro: string;
  uf: string;
  cidade: string;
  onNome: (v: string) => void;
  onCnpj: (v: string) => void;
  onPais: (v: string) => void;
  onCep: (v: string) => void;
  onLogr: (v: string) => void;
  onNum: (v: string) => void;
  onCompl: (v: string) => void;
  onBairro: (v: string) => void;
  onUf: (v: string) => void;
  onCidade: (v: string) => void;
}) {
  return (
    <div style={{ fontSize: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
        <span style={{ width: 90, textAlign: "right" }}>Nome:</span>
        <input value={nome} onChange={(e) => onNome(e.target.value)} style={{ ...fld, flex: 1 }} />
        <span>CNPJ:</span>
        <input value={cnpj} onChange={(e) => onCnpj(e.target.value)} style={{ ...fld, width: 160 }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
        <span style={{ width: 90, textAlign: "right" }}>País:</span>
        <input value={pais} onChange={(e) => onPais(e.target.value)} style={{ ...fld, width: 120 }} />
        <span>CEP:</span>
        <input value={cep} onChange={(e) => onCep(e.target.value)} style={{ ...fld, width: 90 }} />
        <span>Logradouro:</span>
        <input value={logr} onChange={(e) => onLogr(e.target.value)} style={{ ...fld, flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
        <span style={{ width: 90, textAlign: "right" }}>Número:</span>
        <input value={num} onChange={(e) => onNum(e.target.value)} style={{ ...fld, width: 80 }} />
        <span>Complemento:</span>
        <input value={compl} onChange={(e) => onCompl(e.target.value)} style={{ ...fld, width: 140 }} />
        <span>Bairro:</span>
        <input value={bairro} onChange={(e) => onBairro(e.target.value)} style={{ ...fld, flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 90, textAlign: "right" }}>Estado:</span>
        <input value={uf} onChange={(e) => onUf(e.target.value)} style={{ ...fld, width: 140 }} />
        <span>Cidade:</span>
        <input value={cidade} onChange={(e) => onCidade(e.target.value)} style={{ ...fld, flex: 1 }} />
      </div>
    </div>
  );
}

function DialogFoto({
  ctx,
  onClose,
  onSaved,
}: {
  ctx: OsDialogCtx;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState("foto.jpg");
  const [data, setData] = useState(isoDate());
  const [obs, setObs] = useState("");
  const [continuar, setContinuar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pick(file?: File) {
    if (!file) return;
    setFileName(file.name);
    const [a] = await filesToAnexos([file]);
    if (a) setPreview(a.dataUrl);
  }

  function limpar() {
    setPreview(null);
    setObs("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!preview) {
      setErro("Inclua uma foto.");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      await api(`/os/${ctx.numero}/anexos`, {
        method: "POST",
        body: JSON.stringify({ dataUrl: preview, nomeArquivo: fileName, visibilidade: "PUBLICO" }),
      });
      await api(`/os/${ctx.numero}/execucao`, {
        method: "PATCH",
        body: JSON.stringify({
          itens: [
            {
              tipo: "OUTROS_DIRETOS",
              descricao: obs.trim() || fileName,
              quantidade: 1,
              meta: { kind: "FOTO", data, observacao: obs.trim(), produto: fileName },
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
    <WinForm
      title={`OS ${ctx.codigo.replace(/^OS-/, "")}`}
      onSubmit={salvar}
      onCancel={onClose}
      busy={busy}
      erro={erro}
      continuar={continuar}
      setContinuar={setContinuar}
    >
      <Cabecalho ctx={ctx} />
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14, minHeight: 280 }}>
        <div>
          <div
            style={{
              background: "#d8d8d8",
              border: "1px solid #bbb",
              height: 260,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : null}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8 }}>
            <button type="button" style={saveBtn} onClick={() => fileRef.current?.click()}>
              Foto
            </button>
            <button type="button" style={saveBtn} onClick={limpar}>
              Remover
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>
        <div>
          <Linha label="Data:" labelWidth={90}>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={{ ...fld, width: 140, background: YELLOW }} />
          </Linha>
          <div style={{ fontSize: 12, margin: "8px 0 4px" }}>Observação:</div>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} style={{ ...fld, width: "100%", height: 220, resize: "vertical" }} />
        </div>
      </div>
    </WinForm>
  );
}

function DialogAssinatura({
  ctx,
  onClose,
  onSaved,
}: {
  ctx: OsDialogCtx;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const session = useSession();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [papel, setPapel] = useState("Técnico Responsável");
  const [nome, setNome] = useState("");
  const [imprimir, setImprimir] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [temTraço, setTemTraco] = useState(false);

  const clear = useCallback(() => {
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#111";
    g.lineWidth = 2;
    g.lineCap = "round";
    setTemTraco(false);
  }, []);

  useEffect(() => {
    clear();
  }, [clear]);

  function pos(e: PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function drawImage(dataUrl: string) {
    const c = canvasRef.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const img = new Image();
    img.onload = () => {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      setTemTraco(true);
    };
    img.src = dataUrl;
  }

  function usarMinha() {
    setNome(session?.nome ?? "");
    try {
      const raw = localStorage.getItem(SIG_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { dataUrl?: string; nome?: string };
        if (parsed.nome && !session?.nome) setNome(parsed.nome);
        if (parsed.dataUrl) drawImage(parsed.dataUrl);
      }
    } catch {
      /* ignore */
    }
  }

  async function persistir() {
    const dataUrl = canvasRef.current?.toDataURL("image/png") ?? "";
    if (!temTraço || dataUrl.length < 100) throw new Error("Assine no campo acima.");
    try {
      localStorage.setItem(SIG_KEY, JSON.stringify({ dataUrl, nome: nome.trim() || session?.nome || "" }));
    } catch {
      /* ignore */
    }
    await api(`/os/${ctx.numero}/anexos`, {
      method: "POST",
      body: JSON.stringify({
        dataUrl,
        nomeArquivo: `assinatura-${papel.replace(/\s+/g, "-").toLowerCase()}.png`,
        visibilidade: "INTERNO",
      }),
    });
    await api(`/os/${ctx.numero}/comentarios`, {
      method: "POST",
      body: JSON.stringify({
        texto: `Assinatura (${papel})${nome.trim() ? ` — ${nome.trim()}` : ""}`,
        visibilidade: "INTERNO",
      }),
    });
  }

  async function salvar(fechar: boolean) {
    setBusy(true);
    setErro(null);
    try {
      await persistir();
      await onSaved();
      if (fechar) {
        if (imprimir) window.print();
        onClose();
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  const osNum = ctx.codigo.replace(/^OS-/, "");
  return (
    <WinForm
      title={`Assinatura - OS ${osNum}`}
      onCancel={onClose}
      busy={busy}
      erro={erro}
      showContinuar={false}
      hideSubmit
      hideCancel
      extraLeft={
        <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={imprimir} onChange={(e) => setImprimir(e.target.checked)} />
          Abrir impressão individual de OS ao fechar
        </label>
      }
      extraRight={
        <>
          <button type="button" disabled={busy} style={saveBtn} onClick={() => void salvar(false)}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" disabled={busy} style={saveBtn} onClick={() => void salvar(true)}>
            Salvar e Fechar
          </button>
        </>
      }
      width="min(760px, 100%)"
    >
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10, fontSize: 12, flexWrap: "wrap" }}>
        <span>Assinatura:</span>
        <select value={papel} onChange={(e) => setPapel(e.target.value)} style={{ ...fld, width: 180 }}>
          <option>Técnico Responsável</option>
          <option>Solicitante</option>
          <option>Engenheiro Clínico</option>
          <option>Testemunha</option>
        </select>
        <span>Nome:</span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} style={{ ...fld, flex: 1, minWidth: 160 }} />
        <BlueBtn onClick={usarMinha}>Usar minha assinatura</BlueBtn>
      </div>
      <div style={{ position: "relative", background: "white", border: "1px solid #ccc", borderRadius: 8, boxShadow: "inset 0 1px 4px rgba(0,0,0,0.06)" }}>
        <canvas
          ref={canvasRef}
          width={720}
          height={220}
          style={{ width: "100%", height: 220, display: "block", cursor: "crosshair", borderRadius: 8, touchAction: "none" }}
          onPointerDown={(e) => {
            drawing.current = true;
            const g = canvasRef.current?.getContext("2d");
            if (!g) return;
            const p = pos(e);
            g.beginPath();
            g.moveTo(p.x, p.y);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const g = canvasRef.current?.getContext("2d");
            if (!g) return;
            const p = pos(e);
            g.lineTo(p.x, p.y);
            g.stroke();
            setTemTraco(true);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
        />
        <span style={{ position: "absolute", left: 90, bottom: 10, color: "#c0c0c0", fontSize: 18, pointerEvents: "none" }}>
          Assinar acima
        </span>
        <div style={{ position: "absolute", left: 12, bottom: 8 }}>
          <BlueBtn onClick={clear}>Limpar</BlueBtn>
        </div>
      </div>
    </WinForm>
  );
}

function DialogAnexos({
  ctx,
  anexos,
  onClose,
  onSaved,
}: {
  ctx: OsDialogCtx;
  anexos: Anexo[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [tipo, setTipo] = useState("");
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function enviar(files: FileList | File[] | null) {
    const list = await filesToAnexos(files);
    if (!list.length) return;
    setBusy(true);
    setErro(null);
    try {
      for (const f of list) {
        const nome = tipo.trim() ? `${tipo}-${f.nomeArquivo}` : f.nomeArquivo;
        await api(`/os/${ctx.numero}/anexos`, {
          method: "POST",
          body: JSON.stringify({ ...f, nomeArquivo: nome, visibilidade: "PUBLICO" }),
        });
      }
      await onSaved();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinForm
      title={`OS ${ctx.codigo.replace(/^OS-/, "")}`}
      onCancel={onClose}
      busy={busy}
      erro={erro}
      showContinuar={false}
      hideSubmit
      cancelLabel="Fechar"
      width="min(980px, 100%)"
    >
      <Cabecalho ctx={ctx} />
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>Arquivos anexados ao registro:</div>
      <div style={{ background: "white", border: "1px solid #ccc", minHeight: 220, marginBottom: 12 }}>
        {anexos.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => void downloadApi(`/os/${ctx.numero}/anexos/${a.id}`, undefined, a.nomeArquivo)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "6px 10px",
              border: "none",
              borderBottom: "1px solid #eee",
              background: "white",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {a.nomeArquivo}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setHover(true);
          }}
          onDragLeave={() => setHover(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHover(false);
            void enviar(e.dataTransfer.files);
          }}
          style={{
            flex: 1,
            border: "1px dashed #999",
            padding: "10px 12px",
            background: hover ? "#f7f7f7" : "white",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button type="button" style={saveBtn} onClick={() => fileRef.current?.click()}>
            SELECIONAR ARQUIVO
          </button>
          <span style={{ color: "#666" }}>ou Soltar arquivo aqui</span>
        </div>
        <span style={{ fontSize: 12 }}>Tipo de Anexo:</span>
        <Combo
          value={tipo}
          onChange={setTipo}
          options={["Laudo", "Foto", "NF", "Orçamento", "Checklist", "Outro"]}
          width={180}
        />
        <button type="button" disabled={busy} style={saveBtn} onClick={() => fileRef.current?.click()}>
          Enviar
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          onChange={(e) => void enviar(e.target.files)}
        />
      </div>
    </WinForm>
  );
}
