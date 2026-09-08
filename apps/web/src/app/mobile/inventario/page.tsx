"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useCan, useMobilePersona } from "@/lib/session";
import {
  Banner,
  EmptyState,
  FieldLabel,
  GhostButton,
  PageTitle,
  PrimaryButton,
  cardStyle,
  fieldStyle,
} from "@/components/mobile/ui";

interface EquipRow {
  id: string;
  tag: string;
  nome: string;
  situacao: string;
  setor?: { nome: string } | null;
  patrimonio?: string | null;
}

export default function MobileInventarioPage() {
  const canEdit = useCan("equipamentos", 2);
  const { canInventario } = useMobilePersona();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<EquipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const [edit, setEdit] = useState<EquipRow | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPatrimonio, setEditPatrimonio] = useState("");
  const [editObs, setEditObs] = useState("");
  const [busy, setBusy] = useState(false);
  const { pending, online, flush } = useOfflineQueue();

  async function load(p = 1) {
    setErro(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (q.trim()) params.set("q", q.trim());
      const data = await api<{ items: EquipRow[]; total: number; page: number }>(`/mobile/inventario?${params}`);
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (e) {
      setItems([]);
      setErro(e instanceof Error ? e.message : "Erro ao carregar inventário");
    }
  }

  useEffect(() => {
    if (canInventario) void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canInventario]);

  function openEdit(eq: EquipRow) {
    setEdit(eq);
    setEditNome(eq.nome);
    setEditPatrimonio(eq.patrimonio ?? "");
    setEditObs("");
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    setErro(null);
    try {
      await api(`/equipamentos/${encodeURIComponent(edit.tag)}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: editNome.trim(),
          patrimonio: editPatrimonio.trim() || undefined,
          observacao: editObs.trim() || undefined,
        }),
      });
      setEdit(null);
      await load(page);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileFrame title="Inventário" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle
        title="Inventário"
        subtitle={`${total} equipamento(s) · ${canEdit ? "consulta e edição" : "somente leitura"}`}
      />

      {!canInventario ? (
        <EmptyState title="Inventário indisponível" hint="Este perfil não consulta o parque neste momento." />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(1);
              }}
              placeholder="TAG, nome, patrimônio…"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => void load(1)}
              style={{
                border: "none",
                borderRadius: 12,
                padding: "0 16px",
                background: "var(--aion-primary)",
                color: "white",
                fontWeight: 800,
              }}
            >
              Buscar
            </button>
          </div>

          {erro && (
            <div style={{ marginBottom: 12 }}>
              <Banner tone="danger">{erro}</Banner>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {items.map((eq) => (
              <div key={eq.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{eq.tag}</div>
                    <div style={{ fontSize: 13, color: "oklch(0.45 0.02 250)" }}>{eq.nome}</div>
                    <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                      {eq.setor?.nome ?? "—"} · {eq.situacao}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                    <Link
                      href={`/mobile/qr?codigo=${encodeURIComponent(eq.tag)}`}
                      style={{ fontSize: 12, fontWeight: 700, color: "oklch(0.45 0.14 255)", textDecoration: "none" }}
                    >
                      QR / OS
                    </Link>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(eq)}
                        style={{
                          border: "none",
                          background: "oklch(0.95 0.02 255)",
                          color: "oklch(0.4 0.12 255)",
                          borderRadius: 8,
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {items.length === 0 && !erro && (
              <EmptyState title="Nenhum equipamento encontrado" hint="Ajuste a busca por TAG, nome ou patrimônio." />
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
              style={{ border: "none", background: "transparent", fontWeight: 700, opacity: page <= 1 ? 0.4 : 1 }}
            >
              Anterior
            </button>
            <span style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>Pág. {page}</span>
            <button
              type="button"
              disabled={page * 20 >= total}
              onClick={() => void load(page + 1)}
              style={{
                border: "none",
                background: "transparent",
                fontWeight: 700,
                opacity: page * 20 >= total ? 0.4 : 1,
              }}
            >
              Próxima
            </button>
          </div>
        </>
      )}

      {edit && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            background: "rgba(16,24,40,0.45)",
            display: "grid",
            placeItems: "end center",
            padding: 12,
          }}
          onClick={() => setEdit(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(480px, 100%)",
              background: "white",
              borderRadius: 16,
              padding: 16,
              marginBottom: 72,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 12 }}>Editar · {edit.tag}</div>
            <FieldLabel>Nome</FieldLabel>
            <input value={editNome} onChange={(e) => setEditNome(e.target.value)} style={{ ...fieldStyle, marginBottom: 10 }} />
            <FieldLabel>Patrimônio</FieldLabel>
            <input
              value={editPatrimonio}
              onChange={(e) => setEditPatrimonio(e.target.value)}
              style={{ ...fieldStyle, marginBottom: 10 }}
            />
            <FieldLabel>Observação</FieldLabel>
            <input value={editObs} onChange={(e) => setEditObs(e.target.value)} style={{ ...fieldStyle, marginBottom: 14 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <GhostButton onClick={() => setEdit(null)}>Cancelar</GhostButton>
              <PrimaryButton disabled={busy} onClick={() => void saveEdit()}>
                {busy ? "Salvando…" : "Salvar"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </MobileFrame>
  );
}
