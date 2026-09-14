"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { filesToAnexos, labelStatusOS } from "@/lib/os-ui";
import {
  Badge,
  Btn,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface Setor {
  id: string;
  nome: string;
}

interface EquipHint {
  tag: string;
  nome: string;
  patrimonio?: string | null;
  nSerie?: string | null;
  setor?: { nome: string };
}

interface Solicitacao {
  id: string;
  protocolo: string;
  status: string;
  descricao: string;
  justificativaRecusa?: string | null;
  ordemServico?: { codigo: string; numero?: number; status?: string } | null;
}

export default function AbrirSolicitacaoPage() {
  const me = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [minhas, setMinhas] = useState<Solicitacao[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busca, setBusca] = useState("");
  const [hints, setHints] = useState<EquipHint[]>([]);
  const [equipamentoTag, setEquipamentoTag] = useState("");
  const [equipLabel, setEquipLabel] = useState("");
  const [anexos, setAnexos] = useState<Array<{ dataUrl: string; nomeArquivo: string }>>([]);
  const [parado, setParado] = useState(false);

  async function reload() {
    const daSessao = me?.setores ?? [];
    const soSolicitante = me?.perfil === "SOLICITANTE";
    const [s, list] = await Promise.all([
      daSessao.length
        ? Promise.resolve(daSessao)
        : soSolicitante
          ? Promise.resolve([] as Setor[])
          : api<Setor[]>("/setores").catch(() => [] as Setor[]),
      api<Solicitacao[]>("/solicitacoes"),
    ]);
    setSetores(s);
    setMinhas(list.slice(0, 8));
  }

  useEffect(() => {
    void reload().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (busca.trim().length < 2) {
        setHints([]);
        return;
      }
      void api<EquipHint[]>(`/portal/equipamentos?q=${encodeURIComponent(busca.trim())}`)
        .then(setHints)
        .catch(() => setHints([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setErro(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await api<{ protocolo: string; ordemServico?: { codigo?: string | null; numero?: number } | null }>(
        "/solicitacoes",
        {
          method: "POST",
          body: JSON.stringify({
            descricao: String(fd.get("descricao")),
            setorNome: String(fd.get("setorNome")),
            urgencia: String(fd.get("urgencia")),
            equipamentoTag: equipamentoTag || undefined,
            ramal: String(fd.get("ramal") || "") || undefined,
            equipamentoParado: parado,
            impacto: String(fd.get("impacto") || "") || undefined,
            anexos,
          }),
        },
      );
      const osCodigo = res.ordemServico?.codigo;
      setOk(
        osCodigo
          ? `Pedido ${res.protocolo} virou a OS ${osCodigo}. Acompanhe pelo protocolo.`
          : `Pedido ${res.protocolo} registrado`,
      );
      e.currentTarget.reset();
      setEquipamentoTag("");
      setEquipLabel("");
      setBusca("");
      setAnexos([]);
      setParado(false);
      await reload();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader
        title="Abrir chamado"
        subtitle="Descreva o problema. A engenharia clínica recebe na hora."
      />
      <Surface>
        <form ref={formRef} onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 12 }}>
          <div>
            <FieldLabel>Setor</FieldLabel>
            <select name="setorNome" required defaultValue="" style={fieldStyle}>
              <option value="" disabled>
                Escolha o setor
              </option>
              {setores.map((s) => (
                <option key={s.id} value={s.nome}>
                  {s.nome}
                </option>
              ))}
            </select>
            {setores.length === 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "oklch(0.5 0.14 25)" }}>
                Seu usuário não está vinculado a um setor. Peça à engenharia clínica.
              </div>
            )}
          </div>
          <div>
            <FieldLabel>Equipamento (opcional)</FieldLabel>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque por nome, patrimônio ou nº de série"
              style={fieldStyle}
            />
            {equipLabel && (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Selecionado: <strong>{equipLabel}</strong>{" "}
                <button
                  type="button"
                  onClick={() => {
                    setEquipamentoTag("");
                    setEquipLabel("");
                  }}
                  style={{ border: 0, background: "none", color: "oklch(0.45 0.14 255)", fontWeight: 700 }}
                >
                  limpar
                </button>
              </div>
            )}
            {hints.length > 0 && (
              <div style={{ marginTop: 6, border: "1px solid oklch(0.91 0.006 255)", borderRadius: 8 }}>
                {hints.map((h) => (
                  <button
                    key={h.tag}
                    type="button"
                    onClick={() => {
                      setEquipamentoTag(h.tag);
                      setEquipLabel(`${h.nome} (${h.tag})`);
                      setBusca("");
                      setHints([]);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      background: "white",
                      border: 0,
                      borderBottom: "1px solid oklch(0.95 0.004 255)",
                      cursor: "pointer",
                    }}
                  >
                    <strong>{h.nome}</strong> · {h.tag}
                    {h.patrimonio ? ` · pat. ${h.patrimonio}` : ""}
                    {h.nSerie ? ` · s/n ${h.nSerie}` : ""}
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
              Se não souber o equipamento, deixe em branco. A equipe identifica na triagem.
            </div>
          </div>
          <div>
            <FieldLabel>O que aconteceu?</FieldLabel>
            <textarea
              name="descricao"
              placeholder="Conte com suas palavras. Sem dados de paciente."
              rows={4}
              style={fieldStyle}
              required
            />
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={parado} onChange={(e) => setParado(e.target.checked)} />
            O equipamento está parado
          </label>
          <div>
            <FieldLabel>Qual o impacto no setor? (opcional)</FieldLabel>
            <input name="impacto" placeholder="Ex.: sem monitor na sala 2" style={fieldStyle} />
            <div style={{ marginTop: 6, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
              A urgência técnica é confirmada pela engenharia.
            </div>
          </div>
          <div>
            <FieldLabel>Como o setor sente a urgência</FieldLabel>
            <select name="urgencia" defaultValue="MEDIA" style={fieldStyle}>
              <option value="BAIXA">Pode esperar</option>
              <option value="MEDIA">Precisa de atendimento</option>
              <option value="ALTA">Urgente</option>
              <option value="PARADA_CRITICA">Parada crítica</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
              Não define a prioridade técnica. A engenharia confirma na triagem.
            </div>
          </div>
          <div>
            <FieldLabel>Ramal ou contato</FieldLabel>
            <input name="ramal" placeholder="Ramal ou telefone" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Fotos (opcional)</FieldLabel>
            <input
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={(e) => void filesToAnexos(e.target.files).then(setAnexos)}
            />
            {anexos.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12 }}>{anexos.length} arquivo(s) prontos</div>
            )}
          </div>
          <Btn type="submit" disabled={busy}>
            {busy ? "Enviando…" : "Abrir chamado"}
          </Btn>
          {ok && <div style={{ color: "oklch(0.45 0.13 150)", fontSize: 13, fontWeight: 600 }}>{ok}</div>}
          {erro && <Err>{erro}</Err>}
        </form>
      </Surface>

      <h2 style={{ marginTop: 28, fontSize: 16 }}>Meus pedidos</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {minhas.map((s) => (
          <Surface key={s.id} style={{ padding: 12, fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong>{s.protocolo}</strong>
              <Badge tone={s.status}>{s.status === "CONVERTIDA" ? "Em andamento" : s.status}</Badge>
              {s.ordemServico?.numero && (
                <Link href={`/portal/os/${s.ordemServico.numero}`} style={{ fontWeight: 700 }}>
                  {s.ordemServico.codigo}
                  {s.ordemServico.status ? ` · ${labelStatusOS(s.ordemServico.status)}` : ""}
                </Link>
              )}
            </div>
            <div style={{ color: "oklch(0.5 0.02 250)", marginTop: 4 }}>{s.descricao}</div>
            {s.justificativaRecusa && (
              <div style={{ color: "oklch(0.5 0.17 25)", marginTop: 4 }}>
                Motivo: {s.justificativaRecusa}
              </div>
            )}
          </Surface>
        ))}
      </div>
    </div>
  );
}
