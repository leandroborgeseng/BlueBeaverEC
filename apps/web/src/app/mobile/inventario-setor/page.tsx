"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useSession } from "@/lib/session";
import { IconSearch } from "@/components/mobile/icons";
import {
  Banner,
  EmptyState,
  FieldLabel,
  PageTitle,
  Skeleton,
  StatusChip,
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
  tipo: string;
  criticidade: string;
}

export default function MobileInventarioSetorPage() {
  const me = useSession();
  const { pending, online, flush } = useOfflineQueue();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<EquipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<EquipRow[]>("/portal/inventario-setor")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar inventário"))
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
        e.fabricante.toLowerCase().includes(s) ||
        e.modelo.toLowerCase().includes(s),
    );
  }, [items, q]);

  const setorLabel = me?.setores?.map((s) => s.nome).join(" · ") || "setor não vinculado";

  return (
    <MobileFrame title="Inventário" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle title="Inventário do setor" subtitle={`Consulta dos equipamentos de ${setorLabel}`} />

      <FieldLabel>Pesquisar</FieldLabel>
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

      {erro && (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="danger">{erro}</Banner>
        </div>
      )}

      {loading ? (
        <Skeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum equipamento" hint="Confirme o vínculo do seu setor com a engenharia clínica." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {filtered.map((eq) => (
            <div key={eq.tag} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{eq.tag}</div>
                  <div style={{ fontSize: 13, color: "oklch(0.4 0.02 250)" }}>{eq.nome}</div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                    {eq.setor} · {eq.fabricante} {eq.modelo}
                  </div>
                </div>
                <StatusChip value={eq.situacao} />
              </div>
            </div>
          ))}
        </div>
      )}
    </MobileFrame>
  );
}
