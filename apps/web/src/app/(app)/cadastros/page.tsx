"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useCan } from "@/lib/session";
import { Overlay, WinForm, fld } from "@/components/os/os-win-ui";
import {
  FItem,
  FRow,
  ToolBtn,
  WinScreen,
  ZebraTable,
  padCount,
  td,
  winFld,
  zebraRow,
} from "@/components/equipamentos/eq-win-ui";

interface Named {
  id: string;
  nome: string;
  _count?: { equipamentos?: number; modelos?: number };
}

interface Modelo extends Named {
  fabricanteId: string;
  fabricante: { id: string; nome: string };
}

interface Plano extends Named {
  criticidade: string;
  vidaUtilAnos: number;
  slaAtendimentoHoras?: number | null;
  slaConclusaoHoras?: number | null;
}

type CadastroTab = "fabricantes" | "modelos" | "setores" | "planos" | "fornecedores";
const TAB_KEYS: CadastroTab[] = ["fabricantes", "modelos", "setores", "planos", "fornecedores"];

const TITULO: Record<CadastroTab, string> = {
  fabricantes: "Fabricantes",
  modelos: "Modelos",
  setores: "Setores",
  planos: "Plano de Descrições",
  fornecedores: "Fornecedores",
};

export default function CadastrosPage() {
  return (
    <Suspense fallback={<div style={{ color: "#777", fontSize: 13 }}>Carregando cadastros…</div>}>
      <CadastrosInner />
    </Suspense>
  );
}

function CadastrosInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const podeEditar = useCan("equipamentos", 2);
  const tabParam = searchParams.get("tab");
  const tab: CadastroTab = TAB_KEYS.includes(tabParam as CadastroTab) ? (tabParam as CadastroTab) : "fabricantes";

  const [fabricantes, setFabricantes] = useState<Named[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [setores, setSetores] = useState<Named[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [fornecedores, setFornecedores] = useState<Named[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filtroCampo, setFiltroCampo] = useState("nome");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"novo" | "alterar" | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);

  async function reload() {
    const [f, m, s, p, fo] = await Promise.all([
      api<Named[]>("/fabricantes"),
      api<Modelo[]>("/modelos"),
      api<Named[]>("/setores"),
      api<Plano[]>("/planos-descricao"),
      api<Named[]>("/fornecedores"),
    ]);
    setFabricantes(f);
    setModelos(m);
    setSetores(s);
    setPlanos(p);
    setFornecedores(fo);
  }

  useEffect(() => {
    void reload().catch((e) => setMsg(e instanceof Error ? e.message : "Erro"));
  }, []);

  useEffect(() => {
    setQ("");
    setSelectedId(null);
    setDialog(null);
    setMsg(null);
  }, [tab]);

  const termo = q.trim().toLowerCase();
  const lista = useMemo(() => {
    const match = (nome: string, extra?: string) =>
      !termo || nome.toLowerCase().includes(termo) || (extra ?? "").toLowerCase().includes(termo);
    if (tab === "fabricantes") return fabricantes.filter((x) => match(x.nome));
    if (tab === "modelos") return modelos.filter((x) => match(x.nome, x.fabricante.nome));
    if (tab === "setores") return setores.filter((x) => match(x.nome));
    if (tab === "planos") return planos.filter((x) => match(x.nome, x.criticidade));
    return fornecedores.filter((x) => match(x.nome));
  }, [tab, termo, fabricantes, modelos, setores, planos, fornecedores]);

  const selectedPlano = planos.find((p) => p.id === selectedId) ?? null;

  async function createNamed(path: string, body: Record<string, unknown>, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload: Record<string, unknown> = { ...body };
    fd.forEach((v, k) => {
      if (k === "vidaUtilAnos" || k === "slaAtendimentoHoras" || k === "slaConclusaoHoras") {
        const n = Number(v);
        payload[k] = v === "" || Number.isNaN(n) || n <= 0 ? undefined : n;
      } else payload[k] = String(v);
    });
    try {
      await api(path, { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      setMsg("Salvo com sucesso");
      setDialog(null);
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <>
      <WinScreen
        title={TITULO[tab]}
        error={msg && /erro|fail/i.test(msg) ? msg : null}
        toolbar={
          <>
            {podeEditar && (
              <ToolBtn onClick={() => { setMsg(null); setDialog("novo"); }}>
                {tab === "planos" ? "Nova Descrição" : "Novo"}
              </ToolBtn>
            )}
            {tab === "planos" && podeEditar && (
              <ToolBtn disabled={!selectedPlano} onClick={() => selectedPlano && setDialog("alterar")}>
                Alterar
              </ToolBtn>
            )}
            <ToolBtn onClick={() => void reload().catch((e) => setMsg(e instanceof Error ? e.message : "Erro"))}>
              Atualizar
            </ToolBtn>
            {tab !== "planos" && tab !== "fabricantes" && tab !== "modelos" && (
              <>
                <span style={{ width: 12 }} />
                <ToolBtn onClick={() => router.replace("/cadastros?tab=setores")}>Setores</ToolBtn>
                <ToolBtn onClick={() => router.replace("/cadastros?tab=fornecedores")}>Fornecedores</ToolBtn>
              </>
            )}
          </>
        }
        filters={
          tab === "planos" ? undefined : (
            <>
              <FRow>
                <FItem label="Pesquisar:" grow>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Todo ou parte do nome"
                    style={{ ...winFld, flex: 1 }}
                  />
                </FItem>
                <FItem label="No campo:" labelWidth={70}>
                  <select value={filtroCampo} onChange={(e) => setFiltroCampo(e.target.value)} style={{ ...winFld, width: 140 }}>
                    <option value="nome">{tab === "fabricantes" ? "Razão Social" : "Nome"}</option>
                  </select>
                </FItem>
                <span style={{ fontSize: 12, color: "#555" }}>Nos Registros Ativos</span>
              </FRow>
            </>
          )
        }
        footer={<span style={{ marginLeft: "auto" }}>Exibindo {padCount(lista.length)} registros</span>}
      >
        {msg && !/erro|fail/i.test(msg) && (
          <div style={{ padding: "8px 12px", fontSize: 12, color: "#2a7a2a", fontWeight: 600 }}>{msg}</div>
        )}
        {tab === "planos" ? (
          <PlanosTree
            planos={lista as Plano[]}
            q={q}
            setQ={setQ}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            treeOpen={treeOpen}
            setTreeOpen={setTreeOpen}
            onOpen={() => selectedId && podeEditar && setDialog("alterar")}
          />
        ) : tab === "fabricantes" ? (
          <ZebraTable
            columns={[
              { key: "cod", label: "Código", width: 80 },
              { key: "nome", label: "Razão Social" },
              { key: "mod", label: "Modelos", width: 90 },
              { key: "eq", label: "Equipamentos", width: 110 },
              { key: "ativo", label: "Ativo", width: 70 },
            ]}
          >
            {(lista as Named[]).map((f, i) => (
              <tr
                key={f.id}
                style={zebraRow(i, f.id === selectedId)}
                onClick={() => setSelectedId(f.id)}
              >
                <td style={td}>{String(i + 1).padStart(4, "0")}</td>
                <td style={td}>{f.nome}</td>
                <td style={td}>{f._count?.modelos ?? ""}</td>
                <td style={td}>{f._count?.equipamentos ?? ""}</td>
                <td style={td}>SIM</td>
              </tr>
            ))}
          </ZebraTable>
        ) : tab === "modelos" ? (
          <ZebraTable
            columns={[
              { key: "cod", label: "Código", width: 80 },
              { key: "mod", label: "Modelo" },
              { key: "fab", label: "Fabricante" },
              { key: "eq", label: "Equipamentos", width: 110 },
              { key: "ativo", label: "Ativo", width: 70 },
            ]}
          >
            {(lista as Modelo[]).map((m, i) => (
              <tr
                key={m.id}
                style={zebraRow(i, m.id === selectedId)}
                onClick={() => setSelectedId(m.id)}
              >
                <td style={td}>{String(i + 1).padStart(4, "0")}</td>
                <td style={td}>{m.nome}</td>
                <td style={td}>{m.fabricante.nome}</td>
                <td style={td}>{m._count?.equipamentos ?? ""}</td>
                <td style={td}>SIM</td>
              </tr>
            ))}
          </ZebraTable>
        ) : tab === "setores" ? (
          <ZebraTable columns={[{ key: "nome", label: "Setor" }]}>
            {(lista as Named[]).map((s, i) => (
              <tr key={s.id} style={zebraRow(i, s.id === selectedId)} onClick={() => setSelectedId(s.id)}>
                <td style={td}>{s.nome}</td>
              </tr>
            ))}
          </ZebraTable>
        ) : (
          <ZebraTable columns={[{ key: "nome", label: "Fornecedor" }]}>
            {(lista as Named[]).map((s, i) => (
              <tr key={s.id} style={zebraRow(i, s.id === selectedId)} onClick={() => setSelectedId(s.id)}>
                <td style={td}>
                  <Link href={`/fornecedores/${s.id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>
                    {s.nome}
                  </Link>
                </td>
              </tr>
            ))}
          </ZebraTable>
        )}
        {lista.length === 0 && tab !== "planos" && (
          <div style={{ padding: 24, textAlign: "center", color: "#777", fontSize: 13 }}>Nenhum registro neste cadastro.</div>
        )}
      </WinScreen>

      {dialog === "novo" && (
        <Overlay onClose={() => setDialog(null)} fixed>
          <WinForm
            title={`Novo — ${TITULO[tab]}`}
            width="min(420px, 96vw)"
            onCancel={() => setDialog(null)}
            showContinuar={false}
            hideSubmit
          >
            {tab === "fabricantes" && (
              <form onSubmit={(e) => void createNamed("/fabricantes", {}, e)}>
                <Campo nome="Nome" name="nome" placeholder="Fabricante" />
                <button type="submit" style={saveBtn}>Adicionar fabricante</button>
              </form>
            )}
            {tab === "modelos" && (
              <form onSubmit={(e) => void createNamed("/modelos", {}, e)}>
                <label style={lab}>Fabricante</label>
                <select name="fabricanteId" style={{ ...fld, width: "100%", marginBottom: 10 }} required defaultValue="">
                  <option value="" disabled>
                    Selecione
                  </option>
                  {fabricantes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
                <Campo nome="Modelo" name="nome" placeholder="Modelo" />
                <button type="submit" style={saveBtn}>Adicionar modelo</button>
              </form>
            )}
            {tab === "setores" && (
              <form onSubmit={(e) => void createNamed("/setores", {}, e)}>
                <Campo nome="Setor" name="nome" placeholder="UTI Adulto…" />
                <button type="submit" style={saveBtn}>Adicionar setor</button>
              </form>
            )}
            {tab === "planos" && (
              <form onSubmit={(e) => void createNamed("/planos-descricao", {}, e)}>
                <Campo nome="Tipo do ativo" name="nome" placeholder="Ventilador Pulmonar" />
                <label style={lab}>Criticidade</label>
                <select name="criticidade" style={{ ...fld, width: "100%", marginBottom: 10 }} defaultValue="MEDIA">
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                </select>
                <Campo nome="Vida útil (anos)" name="vidaUtilAnos" type="number" defaultValue="10" />
                <Campo nome="SLA 1º atendimento (h úteis)" name="slaAtendimentoHoras" type="number" placeholder="ex.: 4" required={false} />
                <Campo nome="SLA conclusão (h úteis)" name="slaConclusaoHoras" type="number" placeholder="ex.: 24" required={false} />
                <p style={{ margin: "0 0 10px", fontSize: 12, color: "#555" }}>
                  Horas úteis seg–sex 8h–17h. Sem SLA no tipo, vale a prioridade da OS.
                </p>
                <button type="submit" style={saveBtn}>Adicionar plano</button>
              </form>
            )}
            {tab === "fornecedores" && (
              <form onSubmit={(e) => void createNamed("/fornecedores", {}, e)}>
                <Campo nome="Nome" name="nome" placeholder="Razão social" />
                <Campo nome="CNPJ" name="cnpj" placeholder="00.000.000/0000-00" required={false} />
                <button type="submit" style={saveBtn}>Adicionar fornecedor</button>
              </form>
            )}
          </WinForm>
        </Overlay>
      )}

      {dialog === "alterar" && selectedPlano && (
        <AlterarPlanoDialog
          plano={selectedPlano}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void reload().catch((e) => setMsg(e instanceof Error ? e.message : "Erro"));
          }}
        />
      )}
    </>
  );
}

function PlanosTree({
  planos,
  q,
  setQ,
  selectedId,
  setSelectedId,
  treeOpen,
  setTreeOpen,
  onOpen,
}: {
  planos: Plano[];
  q: string;
  setQ: (v: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  treeOpen: boolean;
  setTreeOpen: (v: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: 420 }}>
      <div style={{ borderRight: "1px solid #ccc", padding: 12, background: "#e8e8e8" }}>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Procurar texto:</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} style={{ ...winFld, width: "100%", marginBottom: 8 }} />
        <div style={{ fontSize: 12, marginBottom: 4 }}>No campo:</div>
        <select style={{ ...winFld, width: "100%", marginBottom: 8 }} defaultValue="descricao">
          <option value="descricao">Descrição</option>
        </select>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Filtro:</div>
        <select style={{ ...winFld, width: "100%", marginBottom: 10 }} defaultValue="todos">
          <option value="todos">Todos</option>
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={saveBtn} onClick={() => undefined}>
            Procurar
          </button>
          <button type="button" style={saveBtn} onClick={() => setQ("")}>
            Limpar
          </button>
        </div>
      </div>
      <div style={{ padding: "10px 14px", overflow: "auto", background: "white", fontSize: 13 }}>
        <button
          type="button"
          onClick={() => setTreeOpen(!treeOpen)}
          style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700, fontSize: 13 }}
        >
          {treeOpen ? "▾" : "▸"} PLANO DE DESCRIÇÕES
        </button>
        {treeOpen &&
          planos.map((p, i) => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              onDoubleClick={onOpen}
              style={{
                padding: "4px 8px 4px 22px",
                cursor: "pointer",
                background: p.id === selectedId ? "#cfe8ff" : "transparent",
                display: "flex",
                gap: 8,
              }}
            >
              <span style={{ color: "#888" }}>▤</span>
              <span>
                {i + 1} — {p.nome}
                <span style={{ color: "#777", marginLeft: 8, fontSize: 11 }}>
                  {p.criticidade}
                  {p._count?.equipamentos != null ? ` · ${p._count.equipamentos} eq.` : ""}
                </span>
              </span>
            </div>
          ))}
        {planos.length === 0 && (
          <div style={{ padding: 16, color: "#777" }}>Nenhum tipo cadastrado.</div>
        )}
      </div>
    </div>
  );
}

function AlterarPlanoDialog({
  plano,
  onClose,
  onSaved,
}: {
  plano: Plano;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slaAtendimento, setSlaAtendimento] = useState(plano.slaAtendimentoHoras != null ? String(plano.slaAtendimentoHoras) : "");
  const [slaConclusao, setSlaConclusao] = useState(plano.slaConclusaoHoras != null ? String(plano.slaConclusaoHoras) : "");
  const [criticidade, setCriticidade] = useState(plano.criticidade);
  const [vida, setVida] = useState(String(plano.vidaUtilAnos));
  const [nome, setNome] = useState(plano.nome);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setBusy(true);
    setErro(null);
    try {
      const atend = Number(slaAtendimento);
      const concl = Number(slaConclusao);
      await api(`/planos-descricao/${plano.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome,
          criticidade,
          vidaUtilAnos: Number(vida) || undefined,
          slaAtendimentoHoras: slaAtendimento.trim() && atend > 0 ? atend : null,
          slaConclusaoHoras: slaConclusao.trim() && concl > 0 ? concl : null,
        }),
      });
      onSaved();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} fixed>
      <WinForm
        title="Alterar descrição"
        width="min(440px, 96vw)"
        onCancel={onClose}
        busy={busy}
        erro={erro}
        showContinuar={false}
        hideSubmit
        extraRight={
          <button type="button" disabled={busy} style={saveBtn} onClick={() => void salvar()}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        }
      >
        <label style={lab}>Tipo do ativo</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} style={{ ...fld, width: "100%", marginBottom: 10 }} />
        <label style={lab}>Criticidade</label>
        <select value={criticidade} onChange={(e) => setCriticidade(e.target.value)} style={{ ...fld, width: "100%", marginBottom: 10 }}>
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
        </select>
        <label style={lab}>Vida útil (anos)</label>
        <input type="number" min={1} value={vida} onChange={(e) => setVida(e.target.value)} style={{ ...fld, width: "100%", marginBottom: 10 }} />
        <label style={lab}>SLA 1º atendimento (h úteis)</label>
        <input type="number" min={1} value={slaAtendimento} onChange={(e) => setSlaAtendimento(e.target.value)} style={{ ...fld, width: "100%", marginBottom: 10 }} />
        <label style={lab}>SLA conclusão (h úteis)</label>
        <input type="number" min={1} value={slaConclusao} onChange={(e) => setSlaConclusao(e.target.value)} style={{ ...fld, width: "100%", marginBottom: 10 }} />
      </WinForm>
    </Overlay>
  );
}

function Campo({
  nome,
  name,
  placeholder,
  type = "text",
  defaultValue,
  required = true,
}: {
  nome: string;
  name: string;
  placeholder?: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <>
      <label style={lab}>{nome}</label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        style={{ ...fld, width: "100%", marginBottom: 10 }}
      />
    </>
  );
}

const lab = { display: "block", fontSize: 12, marginBottom: 4 } as const;
const saveBtn = {
  background: "#e8e8e8",
  border: "1px solid #888",
  padding: "5px 14px",
  fontSize: 12,
  cursor: "pointer" as const,
};
