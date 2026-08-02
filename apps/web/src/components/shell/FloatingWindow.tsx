"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore, type FloatingWin } from "@/store/windows";

export function FloatingWindowLayer() {
  const { windows, close, minimize, move } = useWindowStore();
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null);

  return (
    <>
      {windows
        .filter((w) => !w.minimized)
        .map((w) => (
          <WindowFrame
            key={w.id}
            win={w}
            onClose={() => close(w.id)}
            onMinimize={() => minimize(w.id)}
            onPointerDown={(e) => {
              drag.current = { id: w.id, ox: e.clientX - w.x, oy: e.clientY - w.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current || drag.current.id !== w.id) return;
              move(w.id, e.clientX - drag.current.ox, e.clientY - drag.current.oy);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
        ))}
    </>
  );
}

function WindowFrame({
  win,
  onClose,
  onMinimize,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  win: FloatingWin;
  onClose: () => void;
  onMinimize: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        background: "var(--nexo-surface)",
        border: "1px solid var(--nexo-border)",
        borderRadius: 12,
        boxShadow: "0 30px 60px -28px rgba(0,0,0,.45)",
        zIndex: 45,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          height: 42,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderBottom: "1px solid var(--nexo-border)",
          cursor: "grab",
          background: "oklch(0.97 0.01 250)",
          userSelect: "none",
        }}
      >
        <strong style={{ fontSize: 13 }}>{win.title}</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" onClick={onMinimize} style={btn}>
            —
          </button>
          <button type="button" onClick={onClose} style={btn}>
            ✕
          </button>
        </div>
      </div>
      <div style={{ padding: 16, overflow: "auto", flex: 1, fontSize: 13 }}>
        {win.kind === "equipamento" && win.payload?.tag ? (
          <EquipamentoEditor tag={String(win.payload.tag)} onDone={onClose} />
        ) : win.payload ? (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--nexo-text)" }}>
            {JSON.stringify(win.payload, null, 2)}
          </pre>
        ) : (
          <p style={{ color: "var(--nexo-muted)" }}>
            Janela `{win.kind}` — conteúdo será ligado às fichas reais nas próximas sprints.
          </p>
        )}
      </div>
    </div>
  );
}

function EquipamentoEditor({ tag, onDone }: { tag: string; onDone: () => void }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [nome, setNome] = useState("");
  const [observacao, setObservacao] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Record<string, unknown>>(`/equipamentos/${encodeURIComponent(tag)}`)
      .then((eq) => {
        setData(eq);
        setNome(String(eq.nome ?? ""));
        setObservacao(String(eq.observacao ?? ""));
      })
      .catch((e) => setErro(e.message));
  }, [tag]);

  if (erro) return <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>;
  if (!data) return <div style={{ color: "var(--nexo-muted)" }}>Carregando ficha…</div>;

  const readonly =
    data.situacao === "ARQUIVADO" || data.situacao === "INATIVO";

  async function salvar() {
    try {
      const updated = await api<Record<string, unknown>>(`/equipamentos/${encodeURIComponent(tag)}`, {
        method: "PATCH",
        body: JSON.stringify({ nome, observacao }),
      });
      setData(updated);
      setMsg("Salvo");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function arquivar() {
    try {
      await api(`/equipamentos/${encodeURIComponent(tag)}/arquivar`, { method: "POST" });
      setMsg("Arquivado");
      onDone();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="TAG" value={String(data.tag)} />
        <Field label="Situação" value={String(data.situacao)} />
        <Field
          label="Tipo"
          value={String((data.descricao as { nome?: string } | undefined)?.nome ?? "—")}
        />
        <Field
          label="Criticidade"
          value={String((data.descricao as { criticidade?: string } | undefined)?.criticidade ?? "—")}
        />
        <Field
          label="Setor"
          value={String((data.setor as { nome?: string } | undefined)?.nome ?? "—")}
        />
        <Field
          label="Fabricante / Modelo"
          value={`${(data.fabricante as { nome?: string } | undefined)?.nome ?? ""} / ${(data.modelo as { nome?: string } | undefined)?.nome ?? ""}`}
        />
      </div>

      {Boolean(data.checklistRecebimentoPendente) && (
        <div style={{ color: "var(--nexo-warning)", fontWeight: 700 }}>
          Checklist de recebimento pendente
        </div>
      )}

      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--nexo-muted)" }}>Nome</label>
      <input
        value={nome}
        disabled={readonly}
        onChange={(e) => setNome(e.target.value)}
        style={input}
      />
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--nexo-muted)" }}>Observação</label>
      <textarea
        value={observacao}
        disabled={readonly}
        onChange={(e) => setObservacao(e.target.value)}
        rows={4}
        style={input}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={readonly} onClick={() => void salvar()} style={primary}>
          Salvar
        </button>
        <button type="button" disabled={readonly} onClick={() => void arquivar()} style={ghost}>
          Arquivar
        </button>
      </div>
      {msg && <div style={{ color: "var(--nexo-success)" }}>{msg}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--nexo-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--nexo-border)",
  background: "white",
  cursor: "pointer",
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--nexo-border)",
  borderRadius: 10,
  padding: "10px 12px",
};
const primary: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "var(--nexo-primary)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
const ghost: React.CSSProperties = {
  ...primary,
  background: "white",
  color: "var(--nexo-text)",
  border: "1px solid var(--nexo-border)",
};
