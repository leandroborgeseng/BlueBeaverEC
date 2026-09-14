"use client";

import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import { filesToAnexos, labelAcaoOS, labelStatusOS } from "@/lib/os-ui";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Badge, Btn, Err, FieldLabel, PageHeader, Surface, fieldStyle } from "@/components/ui/aion-ui";

interface TimelineItem {
  id: string;
  tipo: string;
  acao: string;
  texto?: string | null;
  createdAt: string;
  autor?: string | null;
}

interface PortalOs {
  numero: number;
  codigo: string;
  status: string;
  prioridade: string;
  abertura: string;
  fechamento?: string | null;
  protocolo?: string;
  descricao?: string | null;
  responsavelNome?: string | null;
  setorNome?: string | null;
  equipamento?: { tag: string; nome: string } | null;
  identificacaoPendente?: boolean;
  equipamentoParado?: boolean;
  textoConclusaoPublico?: string | null;
  pedidoReaberturaEm?: string | null;
  timeline: TimelineItem[];
  anexos: Array<{ id: string; nomeArquivo: string }>;
}

export default function PortalOsDetalhePage() {
  const params = useParams<{ numero: string }>();
  const numero = Number(params.numero);
  const [os, setOs] = useState<PortalOs | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reabrir, setReabrir] = useState(false);

  const load = useCallback(async () => {
    const data = await api<PortalOs>(`/portal/os/${numero}`);
    setOs(data);
  }, [numero]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [load]);

  async function comentar(e: FormEvent) {
    e.preventDefault();
    if (busy || !texto.trim()) return;
    setBusy(true);
    try {
      await api(`/portal/os/${numero}/comentarios`, {
        method: "POST",
        body: JSON.stringify({ texto }),
      });
      setTexto("");
      setMsg("Mensagem enviada");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length || busy) return;
    setBusy(true);
    try {
      const anexos = await filesToAnexos(files);
      for (const a of anexos) {
        await api(`/portal/os/${numero}/anexos`, { method: "POST", body: JSON.stringify(a) });
      }
      setMsg("Foto anexada");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  if (erro && !os) return <Err>{erro}</Err>;
  if (!os) return <div style={{ color: "oklch(0.5 0.02 250)" }}>Carregando…</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader
        title={os.codigo}
        subtitle={os.protocolo ? `Protocolo ${os.protocolo}` : "Acompanhe o andamento do seu pedido"}
      />
      {erro && <Err>{erro}</Err>}
      {msg && <div style={{ marginBottom: 12, fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>{msg}</div>}

      <Surface style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge tone={os.status}>{labelStatusOS(os.status)}</Badge>
          {os.equipamentoParado && <Badge tone="PARADO">Equipamento parado</Badge>}
          {os.identificacaoPendente && <Badge>Equipe vai identificar o equipamento</Badge>}
          {os.pedidoReaberturaEm && <Badge>Reabertura pedida</Badge>}
        </div>
        <div>
          <strong>{os.equipamento?.nome ?? "Equipamento a identificar"}</strong>
          <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
            {os.equipamento?.tag ? `${os.equipamento.tag} · ` : ""}
            {os.setorNome ?? ""}
          </div>
        </div>
        <div style={{ fontSize: 14 }}>{os.descricao}</div>
        <div style={{ fontSize: 13 }}>
          Responsável: <strong>{os.responsavelNome ?? "Aguardando atribuição"}</strong>
        </div>
        {os.textoConclusaoPublico && (
          <div>
            <FieldLabel>Conclusão</FieldLabel>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{os.textoConclusaoPublico}</div>
          </div>
        )}
        {os.status === "CONCLUIDA" && (
          <Btn onClick={() => setReabrir(true)} disabled={Boolean(os.pedidoReaberturaEm)}>
            {os.pedidoReaberturaEm ? "Reabertura já pedida" : "Pedir reabertura"}
          </Btn>
        )}
      </Surface>

      <Surface style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Histórico</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {os.timeline.map((t) => (
            <div key={t.id} style={{ fontSize: 13, borderBottom: "1px solid oklch(0.94 0.004 255)", paddingBottom: 8 }}>
              <strong>{labelAcaoOS(t.acao)}</strong>
              {t.texto && <div style={{ marginTop: 4 }}>{t.texto}</div>}
              <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 12, marginTop: 4 }}>
                {t.autor ? `${t.autor} · ` : ""}
                {new Date(t.createdAt).toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
          {os.timeline.length === 0 && <div style={{ color: "oklch(0.5 0.02 250)" }}>Sem atualizações ainda.</div>}
        </div>
      </Surface>

      {os.anexos.length > 0 && (
        <Surface style={{ marginBottom: 16 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Fotos e anexos</h2>
          {os.anexos.map((a) => (
            <div key={a.id} style={{ marginBottom: 6 }}>
              <Btn
                size="sm"
                variant="ghost"
                onClick={() => void downloadApi(`/portal/os/${numero}/anexos/${a.id}`, undefined, a.nomeArquivo)}
              >
                {a.nomeArquivo}
              </Btn>
            </div>
          ))}
        </Surface>
      )}

      <Surface>
        <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Complementar ou responder</h2>
        <form onSubmit={(e) => void comentar(e)} style={{ display: "grid", gap: 10 }}>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            style={fieldStyle}
            placeholder="Escreva uma informação extra ou responda a equipe"
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn type="submit" disabled={busy || !texto.trim()}>
              Enviar
            </Btn>
            <label style={{ fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Anexar foto
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                hidden
                onChange={(e) => void onFiles(e.target.files)}
              />
            </label>
          </div>
        </form>
      </Surface>

      <ConfirmModal
        open={reabrir}
        title="Pedir reabertura"
        message="O pedido não reabre sozinho. A equipe analisa e decide. Informe o motivo."
        confirmLabel="Enviar pedido"
        requireJustification
        onCancel={() => setReabrir(false)}
        onConfirm={async (j) => {
          await api(`/portal/os/${numero}/pedir-reabertura`, {
            method: "POST",
            body: JSON.stringify({ justificativa: j }),
          });
          setReabrir(false);
          setMsg("Pedido de reabertura enviado à equipe");
          await load();
        }}
      />
    </div>
  );
}
