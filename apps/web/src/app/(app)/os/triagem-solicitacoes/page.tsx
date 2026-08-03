"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
import { OsFilasNav } from "@/components/os/OsFilasNav";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface Solicitacao {
  id: string;
  protocolo: string;
  descricao: string;
  setorNome: string;
  urgencia: string;
  status: string;
  solicitanteNome: string;
  justificativaRecusa?: string | null;
  equipamento?: { tag: string; nome: string } | null;
  ordemServico?: { codigo: string; numero: number } | null;
}

interface EquipOption {
  tag: string;
  nome: string;
}

function EquipamentoCombo({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (tag: string) => void;
}) {
  const [q, setQ] = useState(value);
  const [options, setOptions] = useState<EquipOption[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQ(value);
  }, [value]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 1) {
      setOptions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void api<{ items: EquipOption[] }>(`/equipamentos?q=${encodeURIComponent(q.trim())}&pageSize=10`)
        .then((d) => setOptions(d.items))
        .catch(() => setOptions([]));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <div style={{ position: "relative", minWidth: 200, flex: 1 }}>
      <FieldLabel>Equipamento</FieldLabel>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar por TAG ou nome…"
        style={fieldStyle}
      />
      {open && options.length > 0 && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 10 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 11,
              background: "white",
              border: "1px solid oklch(0.91 0.006 255)",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(16,24,40,0.12)",
              maxHeight: 200,
              overflowY: "auto",
            }}
          >
            {options.map((o) => (
              <button
                key={o.tag}
                type="button"
                onClick={() => {
                  onSelect(o.tag);
                  setQ(o.tag);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <strong>{o.tag}</strong> — {o.nome}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function TriagemPage() {
  const openWindow = useWindowStore((s) => s.open);
  const [items, setItems] = useState<Solicitacao[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});
  const [recusarId, setRecusarId] = useState<string | null>(null);

  async function load() {
    setItems(await api<Solicitacao[]>("/solicitacoes"));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  async function vincular(id: string) {
    const tag = tagDraft[id];
    if (!tag?.trim()) return;
    try {
      await api(`/solicitacoes/${id}/equipamento`, {
        method: "PATCH",
        body: JSON.stringify({ equipamentoTag: tag.trim() }),
      });
      setMsg("Equipamento vinculado");
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function aprovar(id: string) {
    try {
      const res = await api<{
        os: { codigo: string; numero: number; equipamento?: { tag: string; nome: string } };
        avisoDuplicidade?: string;
      }>(`/solicitacoes/${id}/aprovar`, { method: "POST", body: "{}" });

      const os = res.os;
      const eqNome = os.equipamento?.nome ?? "";
      const eqTag = os.equipamento?.tag ?? "";
      openWindow({
        kind: "os",
        title: eqNome ? `${os.codigo} — ${eqNome} · ${eqTag}` : os.codigo,
        payload: { numero: os.numero, codigo: os.codigo },
      });

      setMsg(
        `Convertida em ${os.codigo}${res.avisoDuplicidade ? ` — ${res.avisoDuplicidade}` : ""}`,
      );
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function confirmarRecusa(justificativa?: string) {
    if (!recusarId || !justificativa) return;
    await api(`/solicitacoes/${recusarId}/recusar`, {
      method: "POST",
      body: JSON.stringify({ justificativa }),
    });
    setRecusarId(null);
    setMsg("Solicitação recusada");
    setErro(null);
    await load();
  }

  const pendentes = items.filter((s) => s.status === "PENDENTE").length;

  return (
    <div>
      <PageHeader
        title="Triagem de Solicitações"
        subtitle={
          <span>
            Fila · aprovar cria OS vinculada · recusar exige justificativa · <strong>{pendentes}</strong>{" "}
            pendente(s)
          </span>
        }
      />
      <OsFilasNav />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 255)" }}>{msg}</div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((s) => (
          <Surface key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 15 }}>{s.protocolo}</strong>
                  <Badge tone={s.urgencia}>{s.urgencia}</Badge>
                  <Badge tone={s.status}>{s.status}</Badge>
                </div>
                <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginTop: 6 }}>
                  {s.solicitanteNome} · {s.setorNome}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)", textAlign: "right" }}>
                {s.equipamento ? (
                  <>
                    <strong>{s.equipamento.tag}</strong> — {s.equipamento.nome}
                  </>
                ) : (
                  "Sem equipamento"
                )}
                {s.ordemServico ? (
                  <div>
                    OS: <strong>{s.ordemServico.codigo}</strong>
                  </div>
                ) : null}
              </div>
            </div>

            <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.45 }}>{s.descricao}</p>

            {s.justificativaRecusa && (
              <p style={{ margin: "10px 0 0", color: "oklch(0.45 0.15 25)", fontSize: 13, fontWeight: 600 }}>
                Recusa: {s.justificativaRecusa}
              </p>
            )}

            {s.status === "PENDENTE" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginTop: 14 }}>
                {!s.equipamento && (
                  <>
                    <EquipamentoCombo
                      value={tagDraft[s.id] ?? ""}
                      onSelect={(tag) => setTagDraft((d) => ({ ...d, [s.id]: tag }))}
                    />
                    <Btn variant="ghost" onClick={() => void vincular(s.id)}>
                      Vincular
                    </Btn>
                  </>
                )}
                <Btn variant="primary" onClick={() => void aprovar(s.id)} disabled={!s.equipamento}>
                  Aprovar → OS
                </Btn>
                <Btn variant="danger" onClick={() => setRecusarId(s.id)}>
                  Recusar
                </Btn>
              </div>
            )}
          </Surface>
        ))}
        {items.length === 0 && <Empty text="Nenhuma solicitação na fila." />}
      </div>

      <ConfirmModal
        open={recusarId != null}
        title="Recusar solicitação"
        message="Informe a justificativa da recusa. Esta ação não pode ser desfeita."
        confirmLabel="Recusar"
        danger
        requireJustification
        onConfirm={(j) => confirmarRecusa(j)}
        onCancel={() => setRecusarId(null)}
      />
    </div>
  );
}
