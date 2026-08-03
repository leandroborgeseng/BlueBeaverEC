"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Panel,
  fieldStyle,
} from "@/components/ui/nexo-ui";

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

  async function load() {
    const [c, e] = await Promise.all([
      api<Colab[]>("/pessoas/colaboradores"),
      api<Equipe[]>("/pessoas/equipes"),
    ]);
    setColabs(c);
    setEquipes(e);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

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
      setErro(null);
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
          membroIds: String(fd.get("membroIds") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      e.currentTarget.reset();
      setErro(null);
      setMsg("Equipe criada");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  const sobrecarregados = colabs.filter((c) => c.sobrecarga).length;

  return (
    <div>
      <PageHeader
        title="Pessoas e Equipes"
        subtitle={
          <span>
            Carga ≥ 2 destaca sobrecarga · certificação vencida só alerta ·{" "}
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Colaboradores">
          <form onSubmit={(e) => void createColab(e)} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div>
              <FieldLabel>Matrícula</FieldLabel>
              <input name="matricula" placeholder="Matrícula" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Nome</FieldLabel>
              <input name="nome" placeholder="Nome completo" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Cargo</FieldLabel>
              <input name="cargo" placeholder="Cargo" style={fieldStyle} />
            </div>
            <Btn type="submit">Adicionar</Btn>
          </form>
          {colabs.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "12px 10px",
                borderTop: "1px solid oklch(0.93 0.005 255)",
                background: c.sobrecarga ? "oklch(0.98 0.03 40)" : undefined,
                borderRadius: 8,
                marginTop: 2,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{c.nome}</strong>
                <span style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{c.matricula}</span>
                <Badge>carga {c.cargaAtual}</Badge>
                {c.sobrecarga && <Badge tone="SOBRECARGA">SOBRECARGA</Badge>}
              </div>
              {c.cargo && <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>{c.cargo}</div>}
              {c.competenciasVencidas.length > 0 && (
                <div style={{ fontSize: 12, color: "oklch(0.55 0.12 75)", marginTop: 6, fontWeight: 600 }}>
                  Certificação vencida: {c.competenciasVencidas.map((x) => x.nome).join(", ")}
                </div>
              )}
            </div>
          ))}
          {colabs.length === 0 && <Empty text="Nenhum colaborador." />}
        </Panel>

        <Panel title="Equipes">
          <form onSubmit={(e) => void createEquipe(e)} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div>
              <FieldLabel>Nome</FieldLabel>
              <input name="nome" placeholder="Nome da equipe" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Turno</FieldLabel>
              <input name="turno" placeholder="Turno" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>IDs membros</FieldLabel>
              <input name="membroIds" placeholder="cuid,cuid" style={fieldStyle} />
            </div>
            <Btn type="submit">Criar equipe</Btn>
          </form>
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
    </div>
  );
}
