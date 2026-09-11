"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { labelResponsavel, useSession } from "@/lib/session";
import {
  Banner,
  EmptyState,
  FieldLabel,
  PageTitle,
  PrioChip,
  PrimaryButton,
  cardStyle,
  fieldStyle,
} from "@/components/mobile/ui";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  prioridade: string;
  equipamento?: { tag: string; nome: string } | null;
}

interface Colab {
  id: string;
  nome: string;
  funcao?: string | null;
  cargo?: string | null;
}

export default function MobileAtribuirPage() {
  const me = useSession();
  const podeAtribuir = Boolean(me?.permissoes?.alterarStatusOS);
  const { pending, online } = useOfflineQueue();
  const [items, setItems] = useState<OsRow[]>([]);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [os, c] = await Promise.all([
      api<OsRow[]>("/os/nao-atribuidas"),
      api<Colab[]>("/os/responsaveis"),
    ]);
    setItems(os);
    setColabs(c);
  }

  useEffect(() => {
    if (!podeAtribuir) {
      setLoading(false);
      return;
    }
    void load()
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [podeAtribuir]);

  async function atribuir(numero: number) {
    const responsavelId = sel[String(numero)];
    if (!responsavelId) {
      setErro("Selecione um responsável");
      return;
    }
    try {
      await api(`/os/${numero}/atribuir`, {
        method: "PATCH",
        body: JSON.stringify({ responsavelId }),
      });
      setMsg(`OS-${String(numero).padStart(5, "0")} atribuída`);
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao atribuir");
    }
  }

  if (!podeAtribuir) {
    return (
      <MobileFrame title="Atribuir" online={online} pending={pending}>
        <EmptyState title="Sem permissão" hint="Somente engenheiro, gestor ou admin atribui OS." />
      </MobileFrame>
    );
  }

  return (
    <MobileFrame title="Atribuir OS" online={online} pending={pending}>
      <PageTitle title="Não atribuídas" subtitle="Técnicos e engenheiros — não o usuário final" />
      {erro && (
        <div style={{ marginBottom: 10 }}>
          <Banner tone="danger">{erro}</Banner>
        </div>
      )}
      {msg && (
        <div style={{ marginBottom: 10 }}>
          <Banner tone="success">{msg}</Banner>
        </div>
      )}
      {loading ? (
        <EmptyState title="Carregando…" />
      ) : items.length === 0 ? (
        <EmptyState title="Fila vazia" hint="Todas as OS estão atribuídas." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {items.map((os) => (
            <div key={os.id} style={{ ...cardStyle, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{os.codigo}</div>
                  <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                    {os.equipamento?.tag ?? "—"} — {os.equipamento?.nome ?? "Chamado do setor"}
                  </div>
                </div>
                <PrioChip value={os.prioridade} />
              </div>
              <div>
                <FieldLabel>Responsável</FieldLabel>
                <select
                  value={sel[String(os.numero)] ?? ""}
                  onChange={(e) => setSel((s) => ({ ...s, [String(os.numero)]: e.target.value }))}
                  style={fieldStyle}
                >
                  <option value="">Selecionar…</option>
                  {colabs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {labelResponsavel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <PrimaryButton onClick={() => void atribuir(os.numero)}>Atribuir</PrimaryButton>
            </div>
          ))}
        </div>
      )}
    </MobileFrame>
  );
}
