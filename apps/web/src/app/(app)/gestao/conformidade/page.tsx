"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  FieldLabel,
  PageHeader,
  Panel,
  fieldStyle,
} from "@/components/ui/nexo-ui";

interface Req {
  id: string;
  codigo: string;
  norma: string;
  texto: string;
  categoria: string;
  status?: string;
  evidencia?: { descricao?: string | null } | null;
}

export default function ConformidadePage() {
  const [itens, setItens] = useState<Req[]>([]);
  const [tab, setTab] = useState<"conf" | "req" | "pop">("conf");
  const [pops, setPops] = useState<Array<{ id: string; codigo: string; titulo: string; versao: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [c, p] = await Promise.all([
      api<Req[]>("/estrategico/conformidade"),
      api<Array<{ id: string; codigo: string; titulo: string; versao: string }>>("/estrategico/pops"),
    ]);
    setItens(c);
    setPops(p);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function evidenciar(requisitoId: string) {
    const descricao = window.prompt("Descrição da evidência:");
    if (!descricao) return;
    const status = window.prompt("Status (CONFORME|PARCIAL|NAO_CONFORME):", "CONFORME") || "CONFORME";
    await api("/estrategico/evidencias", {
      method: "POST",
      body: JSON.stringify({ requisitoId, tipo: "documento", descricao, status }),
    });
    await load();
  }

  async function createPop(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/estrategico/pops", {
      method: "POST",
      body: JSON.stringify({
        codigo: String(fd.get("codigo")),
        titulo: String(fd.get("titulo")),
        procedimentoLaudoId: String(fd.get("procedimentoLaudoId") || "") || undefined,
      }),
    });
    e.currentTarget.reset();
    setMsg("POP criado (vínculo 1:1 com procedimento, se informado)");
    await load();
  }

  return (
    <div>
      <PageHeader title="Conformidade e POPs" subtitle="Catálogo de requisitos pré-cadastrado · evidências · biblioteca de POPs" />
      {msg && <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["conf", "req", "pop"] as const).map((t) => (
          <Btn key={t} variant={tab === t ? "primary" : "ghost"} onClick={() => setTab(t)}>
            {t === "conf" ? "Central" : t === "req" ? "Catálogo" : "POPs"}
          </Btn>
        ))}
      </div>

      {tab !== "pop" && (
        <div style={{ display: "grid", gap: 10 }}>
          {itens.map((r) => (
            <Panel key={r.id} title={`${r.codigo} · ${r.norma}`} action={tab === "conf" ? <Btn variant="secondary" onClick={() => void evidenciar(r.id)}>Evidenciar</Btn> : undefined}>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{r.texto}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                {r.categoria}
                <Badge tone={r.status ?? "PENDENTE"}>{r.status ?? "SEM_EVIDENCIA"}</Badge>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {tab === "pop" && (
        <Panel title="Biblioteca de POPs">
          <form onSubmit={(e) => void createPop(e)} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: 10, alignItems: "end", marginBottom: 14 }}>
            <div>
              <FieldLabel>Código</FieldLabel>
              <input name="codigo" placeholder="Código" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Título</FieldLabel>
              <input name="titulo" placeholder="Título" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Procedimento</FieldLabel>
              <input name="procedimentoLaudoId" placeholder="ID (opcional)" style={fieldStyle} />
            </div>
            <Btn type="submit">Novo POP</Btn>
          </form>
          {pops.map((p) => (
            <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid oklch(0.94 0.005 255)", fontSize: 13 }}>
              <strong>{p.codigo}</strong> · {p.titulo} · v{p.versao}
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
