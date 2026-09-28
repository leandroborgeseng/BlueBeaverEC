"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useCampoCache } from "@/lib/mobile-cache";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useSession } from "@/lib/session";
import { IconSearch } from "@/components/mobile/icons";
import {
  Banner,
  EmptyState,
  FieldLabel,
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
  const router = useRouter();
  const { pending, online, flush } = useOfflineQueue();
  const cachedEq = useCampoCache((s) => s.equipamentos);
  const [passo, setPasso] = useState<"menu" | "equipamento">("menu");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<EquipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const setorLabel = me?.setores?.map((s) => s.nome).join(" · ") || "setor não vinculado";

  useEffect(() => {
    if (passo !== "equipamento") return;
    setLoading(true);
    api<EquipRow[]>("/portal/inventario-setor")
      .then(setItems)
      .catch((e) => {
        if (cachedEq.length) {
          setItems(
            cachedEq.map((eq) => ({
              tag: eq.tag,
              nome: eq.nome,
              situacao: eq.situacao ?? "",
              setor: eq.localizacao || eq.setor || "",
              fabricante: eq.fabricante ?? "",
              modelo: eq.modelo ?? "",
            })),
          );
        }
        setErro(e instanceof Error ? e.message : "Erro ao carregar equipamentos");
      })
      .finally(() => setLoading(false));
  }, [passo, cachedEq]);

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

  if (passo === "menu") {
    return (
      <MobileFrame title="Nova requisição" online={online} pending={pending} onSync={() => void flush()}>
        <PageTitle title="Nova requisição" subtitle={`Chamado de ${setorLabel}`} />
        <div style={{ display: "grid", gap: 10 }}>
          <PrimaryButton onClick={() => router.push("/mobile/solicitar")}>+ Setor</PrimaryButton>
          <PrimaryButton onClick={() => setPasso("equipamento")}>+ Equipamento</PrimaryButton>
          <PrimaryButton href="/mobile/qr">QR code</PrimaryButton>
        </div>
        <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)", marginTop: 14, lineHeight: 1.45 }}>
          Setor abre o chamado sem TAG. Equipamento escolhe na lista. QR lê a etiqueta.
        </div>
      </MobileFrame>
    );
  }

  return (
    <MobileFrame title="Equipamento" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle title="Escolher equipamento" subtitle={setorLabel} />
      <button
        type="button"
        onClick={() => setPasso("menu")}
        style={{
          border: "none",
          background: "transparent",
          fontWeight: 700,
          marginBottom: 12,
          padding: 0,
          color: "oklch(0.45 0.14 255)",
        }}
      >
        ← Voltar
      </button>

      <FieldLabel>Pesquisar no departamento</FieldLabel>
      <div style={{ position: "relative", marginBottom: 12 }}>
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

      {erro && items.length === 0 && (
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
              <div style={{ fontWeight: 800 }}>{eq.nome}</div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                Setor: {eq.setor}
              </div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                Fabricante: {eq.fabricante} · Modelo: {eq.modelo}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>TAG: {eq.tag}</div>
            </Link>
          ))}
        </div>
      )}
    </MobileFrame>
  );
}
