"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  Loading,
  PageHeader,
  Panel,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface Colab {
  id: string;
  nome: string;
  matricula: string;
  cargo?: string | null;
  cargaAtual: number;
  sobrecarga: boolean;
  competencias: Array<{ nome: string; validade?: string | null }>;
  competenciasVencidas: Array<{ nome: string }>;
}

interface Equipe {
  id: string;
  nome: string;
  turno?: string | null;
  membros: Array<{ colaborador: { nome: string } }>;
}

export default function PessoasPage() {
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [somenteSobrecarga, setSomenteSobrecarga] = useState(false);
  const [showColabForm, setShowColabForm] = useState(false);
  const [showEquipeForm, setShowEquipeForm] = useState(false);
  const [membroIds, setMembroIds] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([
        api<Colab[]>("/pessoas/colaboradores"),
        api<Equipe[]>("/pessoas/equipes"),
      ]);
      setColabs(c);
      setEquipes(e);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const colabsFiltrados = useMemo(() => {
    const term = q.trim().toLowerCase();
    return colabs.filter((c) => {
      if (somenteSobrecarga && !c.sobrecarga) return false;
      if (!term) return true;
      return (
        c.nome.toLowerCase().includes(term) ||
        c.matricula.toLowerCase().includes(term) ||
        (c.cargo ?? "").toLowerCase().includes(term)
      );
    });
  }, [colabs, q, somenteSobrecarga]);

  async function createColab(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/pessoas/colaboradores", {
        method: "POST",
        body: JSON.stringify({
          matricula: String(fd.get("matricula")),
          nome: String(fd.get("nome")),
          cargo: String(fd.get("cargo") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setShowColabForm(false);
      setErro(null);
      setMsg("Colaborador adicionado");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function createEquipe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/pessoas/equipes", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          turno: String(fd.get("turno") || "") || undefined,
          membroIds,
        }),
      });
      e.currentTarget.reset();
      setMembroIds([]);
      setShowEquipeForm(false);
      setErro(null);
      setMsg("Equipe criada");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  function toggleMembro(id: string) {
    setMembroIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const sobrecarregados = colabs.filter((c) => c.sobrecarga).length;

  return (
    <div>
      <PageHeader
        title="Pessoas e Equipes"
        subtitle={
          <span>
            Carga ≥ 2 destaca sobrecarga ·{" "}
            <strong style={{ color: sobrecarregados ? "oklch(0.5 0.17 25)" : undefined }}>
              {sobrecarregados} em sobrecarga
            </strong>
          </span>
        }
      />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>{msg}</div>
      )}

      <FilterBar>
        <div>
          <FieldLabel htmlFor="pes-q">Busca</FieldLabel>
          <input
            id="pes-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, matrícula, cargo…"
            style={fieldStyle}
          />
        </div>
        <div>
          <FieldLabel htmlFor="pes-sobre">Filtro</FieldLabel>
          <label
            htmlFor="pes-sobre"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, height: 40 }}
          >
            <input
              id="pes-sobre"
              type="checkbox"
              checked={somenteSobrecarga}
              onChange={(e) => setSomenteSobrecarga(e.target.checked)}
            />
            Só sobrecarga
          </label>
        </div>
      </FilterBar>

      {loading ? (
        <Loading />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
          <Panel
            title="Colaboradores"
            action={
              <Btn type="button" size="sm" variant="secondary" onClick={() => setShowColabForm((v) => !v)}>
                {showColabForm ? "Cancelar" : "Novo"}
              </Btn>
            }
          >
            {showColabForm && (
              <form onSubmit={(e) => void createColab(e)} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                <div>
                  <FieldLabel htmlFor="col-mat">Matrícula</FieldLabel>
                  <input id="col-mat" name="matricula" required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel htmlFor="col-nome">Nome</FieldLabel>
                  <input id="col-nome" name="nome" required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel htmlFor="col-cargo">Cargo</FieldLabel>
                  <input id="col-cargo" name="cargo" style={fieldStyle} />
                </div>
                <Btn type="submit">Adicionar</Btn>
              </form>
            )}
            <DataTable>
              <thead>
                <tr>
                  <th style={th}>Nome</th>
                  <th style={th}>Carga</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {colabsFiltrados.map((c) => (
                  <tr key={c.id} style={{ background: c.sobrecarga ? "oklch(0.98 0.03 40)" : undefined }}>
                    <td style={td}>
                      <strong>{c.nome}</strong>
                      <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                        {c.matricula}
                        {c.cargo ? ` · ${c.cargo}` : ""}
                      </div>
                      {c.competenciasVencidas.length > 0 && (
                        <div style={{ fontSize: 11, color: "oklch(0.55 0.12 75)", marginTop: 4, fontWeight: 600 }}>
                          Cert. vencida: {c.competenciasVencidas.map((x) => x.nome).join(", ")}
                        </div>
                      )}
                    </td>
                    <td style={td}>{c.cargaAtual}</td>
                    <td style={td}>{c.sobrecarga ? <Badge tone="SOBRECARGA">SOBRECARGA</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {colabsFiltrados.length === 0 && <Empty text="Nenhum colaborador." />}
          </Panel>

          <Panel
            title="Equipes"
            action={
              <Btn type="button" size="sm" variant="secondary" onClick={() => setShowEquipeForm((v) => !v)}>
                {showEquipeForm ? "Cancelar" : "Nova"}
              </Btn>
            }
          >
            {showEquipeForm && (
              <form onSubmit={(e) => void createEquipe(e)} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
                <div>
                  <FieldLabel htmlFor="eq-nome">Nome</FieldLabel>
                  <input id="eq-nome" name="nome" required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel htmlFor="eq-turno">Turno</FieldLabel>
                  <input id="eq-turno" name="turno" style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Membros</FieldLabel>
                  <div
                    style={{
                      maxHeight: 160,
                      overflow: "auto",
                      border: "1px solid oklch(0.9 0.01 250)",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    {colabs.map((c) => (
                      <label
                        key={c.id}
                        style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0" }}
                      >
                        <input
                          type="checkbox"
                          checked={membroIds.includes(c.id)}
                          onChange={() => toggleMembro(c.id)}
                        />
                        {c.nome} ({c.matricula})
                      </label>
                    ))}
                    {colabs.length === 0 && (
                      <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>Cadastre colaboradores antes.</div>
                    )}
                  </div>
                </div>
                <Btn type="submit">Criar equipe</Btn>
              </form>
            )}
            {equipes.map((eq) => (
              <div key={eq.id} style={{ padding: "12px 0", borderTop: "1px solid oklch(0.93 0.005 255)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <strong>{eq.nome}</strong>
                  {eq.turno && <Badge>{eq.turno}</Badge>}
                </div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                  {eq.membros.map((m) => m.colaborador.nome).join(", ") || "Sem membros"}
                </div>
              </div>
            ))}
            {equipes.length === 0 && <Empty text="Nenhuma equipe." />}
          </Panel>
        </div>
      )}
    </div>
  );
}
