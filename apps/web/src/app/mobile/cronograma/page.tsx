"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useSession } from "@/lib/session";
import {
  EmptyState,
  FilterPills,
  PageTitle,
  Skeleton,
  StatusChip,
  cardStyle,
} from "@/components/mobile/ui";

interface CronogramaRow {
  id: string;
  tipo: string;
  validadeAte: string | null;
  equipamento: { tag: string; nome: string; setor: string };
  status: string;
}

export default function MobileCronogramaPage() {
  const me = useSession();
  const { pending, online, flush } = useOfflineQueue();
  const [items, setItems] = useState<CronogramaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"TODOS" | "CALIBRACAO" | "TSE" | "PREVENTIVA" | "QUALIFICACAO">("TODOS");

  useEffect(() => {
    api<CronogramaRow[]>("/portal/cronograma-manutencao")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (filtro === "TODOS" ? items : items.filter((i) => i.tipo === filtro)),
    [items, filtro],
  );

  const setorLabel = me?.setores?.map((s) => s.nome).join(" · ") || "parque";

  return (
    <MobileFrame title="Manutenção" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle
        title="Cronograma de manutenção"
        subtitle={`Preventiva, TSE, calibração e qualificação · ${setorLabel}`}
      />
      <FilterPills
        value={filtro}
        onChange={setFiltro}
        options={[
          { id: "TODOS", label: "Todos" },
          { id: "PREVENTIVA", label: "Preventiva" },
          { id: "CALIBRACAO", label: "Calibração" },
          { id: "TSE", label: "TSE" },
          { id: "QUALIFICACAO", label: "Qualif." },
        ]}
      />
      {loading ? (
        <Skeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nada no cronograma" hint="Quando houver validade de laudo no seu setor, ela aparece aqui." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((row) => (
            <div key={row.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>{row.equipamento.tag}</strong>
                <StatusChip value={row.status} />
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 650 }}>{row.equipamento.nome}</div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 6 }}>
                {row.tipo.replace(/_/g, " ")} · {row.equipamento.setor}
                {row.validadeAte
                  ? ` · ${new Date(row.validadeAte).toLocaleDateString("pt-BR")}`
                  : " · sem validade"}
              </div>
            </div>
          ))}
        </div>
      )}
    </MobileFrame>
  );
}
