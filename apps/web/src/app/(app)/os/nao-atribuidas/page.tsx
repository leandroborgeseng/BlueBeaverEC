"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { OsFilasNav } from "@/components/os/OsFilasNav";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  PriorityBar,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  prioridade: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string };
}

interface Colab {
  id: string;
  nome: string;
  matricula: string;
}

export default function NaoAtribuidasPage() {
  const [items, setItems] = useState<OsRow[]>([]);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    const [os, c] = await Promise.all([
      api<OsRow[]>("/os/nao-atribuidas"),
      api<Colab[]>("/pessoas/colaboradores"),
    ]);
    setItems(os);
    setColabs(c.filter((x) => x.matricula));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  async function atribuir(numero: number) {
    const responsavelId = sel[String(numero)];
    if (!responsavelId) {
      setErro("Selecione um colaborador");
      return;
    }
    try {
      await api(`/os/${numero}/atribuir`, {
        method: "PATCH",
        body: JSON.stringify({ responsavelId }),
      });
      setMsg(`OS-${numero} atribuída`);
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao atribuir");
    }
  }

  return (
    <div>
      <PageHeader
        title="Não atribuídas"
        subtitle={
          <span>
            Fila · ordenada por prioridade e abertura · <strong>{items.length}</strong> na fila
          </span>
        }
      />
      <OsFilasNav />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>{msg}</div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((os) => (
          <Surface
            key={os.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr minmax(180px, 220px) auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
              <PriorityBar prioridade={os.prioridade} />
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{os.codigo}</strong>
                  <Badge tone={os.prioridade}>{os.prioridade}</Badge>
                  {os.atrasada && <Badge tone="ATRASADA">ATRASADA</Badge>}
                </div>
                <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                  {os.equipamento.tag} — {os.equipamento.nome}
                </div>
              </div>
            </div>
            <div>
              <FieldLabel>Técnico</FieldLabel>
              <select
                value={sel[String(os.numero)] ?? ""}
                onChange={(e) => setSel((s) => ({ ...s, [String(os.numero)]: e.target.value }))}
                style={fieldStyle}
              >
                <option value="">Selecionar…</option>
                {colabs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.matricula})
                  </option>
                ))}
              </select>
            </div>
            <Btn onClick={() => void atribuir(os.numero)}>Atribuir</Btn>
          </Surface>
        ))}
        {items.length === 0 && <Empty text="Fila vazia — todas as OS estão atribuídas." />}
      </div>
    </div>
  );
}
