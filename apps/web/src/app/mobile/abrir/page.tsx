"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useSession } from "@/lib/session";
import { IconQr, IconSearch, IconTag } from "@/components/mobile/icons";
import {
  Banner,
  EmptyState,
  FieldLabel,
  GhostButton,
  PageTitle,
  PrimaryButton,
  Skeleton,
  cardStyle,
  fieldStyle,
} from "@/components/mobile/ui";

interface EquipRow {
  tag: string;
  nome: string;
  situacao: string;
  setor: string;
  fabricante: string;
  modelo: string;
}

export default function MobileAbrirPage() {
  const me = useSession();
  const { pending, online, flush } = useOfflineQueue();
  const [tag, setTag] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<EquipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tagErro, setTagErro] = useState<string | null>(null);
  const [tagOk, setTagOk] = useState<EquipRow | null>(null);

  const setorLabel = me?.setores?.map((s) => s.nome).join(" · ") || "setor não vinculado";

  useEffect(() => {
    api<EquipRow[]>("/portal/inventario-setor")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar equipamentos"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (e) =>
        e.tag.toLowerCase().includes(s) ||
        e.nome.toLowerCase().includes(s) ||
        e.setor.toLowerCase().includes(s) ||
        e.fabricante.toLowerCase().includes(s),
    );
  }, [items, q]);

  async function consultarTag() {
    const code = tag.trim();
    if (!code) return;
    setTagErro(null);
    setTagOk(null);
    try {
      const data = await api<{
        equipamento: {
          tag: string;
          nome: string;
          situacao?: string;
          setor?: { nome: string } | null;
          fabricante?: { nome: string } | null;
          modelo?: { nome: string } | null;
        };
      }>(`/portal/equipamento/${encodeURIComponent(code)}`);
      const eq = data.equipamento;
      setTagOk({
        tag: eq.tag,
        nome: eq.nome,
        situacao: eq.situacao ?? "",
        setor: eq.setor?.nome ?? "",
        fabricante: eq.fabricante?.nome ?? "",
        modelo: eq.modelo?.nome ?? "",
      });
    } catch (e) {
      setTagErro(e instanceof Error ? e.message : "Equipamento não encontrado");
    }
  }

  return (
    <MobileFrame title="Abrir OS" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle
        title="Abrir ordem de serviço"
        subtitle={`Equipamentos de ${setorLabel}`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
        <GhostButton href="/mobile/qr">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
            <IconQr size={18} color="oklch(0.45 0.14 255)" />
            Ler QR
          </span>
        </GhostButton>
        <GhostButton onClick={() => document.getElementById("tag-input")?.focus()}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
            <IconTag size={18} color="oklch(0.55 0.16 38)" />
            Informar TAG
          </span>
        </GhostButton>
      </div>

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <FieldLabel>TAG do equipamento</FieldLabel>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="tag-input"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void consultarTag();
            }}
            placeholder="EQ-0001"
            style={{ ...fieldStyle, flex: 1, fontWeight: 700 }}
          />
          <button
            type="button"
            onClick={() => void consultarTag()}
            style={{
              border: "none",
              borderRadius: 12,
              padding: "0 16px",
              background: "var(--aion-primary)",
              color: "white",
              fontWeight: 800,
            }}
          >
            Ir
          </button>
        </div>
        {tagErro && (
          <div style={{ marginTop: 10 }}>
            <Banner tone="danger">{tagErro}</Banner>
          </div>
        )}
        {tagOk && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800 }}>{tagOk.tag}</div>
            <div style={{ fontSize: 13, color: "oklch(0.45 0.02 250)" }}>{tagOk.nome}</div>
            <div style={{ marginTop: 10 }}>
              <PrimaryButton href={`/mobile/solicitar?tag=${encodeURIComponent(tagOk.tag)}`}>
                Abrir OS deste equipamento
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>

      <FieldLabel>Pesquisar no departamento</FieldLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 12, top: 13, pointerEvents: "none" }}>
            <IconSearch size={16} color="oklch(0.55 0.02 250)" />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, TAG, fabricante…"
            style={{ ...fieldStyle, paddingLeft: 36 }}
          />
        </div>
      </div>

      {erro && (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="danger">{erro}</Banner>
        </div>
      )}

      {loading ? (
        <Skeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum equipamento" hint="Ajuste a busca ou confirme o vínculo do seu setor." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.slice(0, 40).map((eq) => (
            <Link
              key={eq.tag}
              href={`/mobile/solicitar?tag=${encodeURIComponent(eq.tag)}`}
              style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{eq.tag}</div>
                  <div style={{ fontSize: 13, color: "oklch(0.4 0.02 250)" }}>{eq.nome}</div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                    {eq.setor} · {eq.fabricante} {eq.modelo}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: "oklch(0.55 0.14 38)", whiteSpace: "nowrap" }}>
                  Abrir OS ›
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </MobileFrame>
  );
}
