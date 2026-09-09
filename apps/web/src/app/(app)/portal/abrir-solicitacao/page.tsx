"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
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

interface Solicitacao {
  id: string;
  protocolo: string;
  status: string;
  descricao: string;
  justificativaRecusa?: string | null;
  ordemServico?: { codigo: string } | null;
}

export default function AbrirSolicitacaoPage() {
  const me = useSession();
  const [setores, setSetores] = useState<Setor[]>([]);
  const [minhas, setMinhas] = useState<Solicitacao[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function reload() {
    const daSessao = me?.setores ?? [];
    const [s, list] = await Promise.all([
      daSessao.length
        ? Promise.resolve(daSessao)
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await api<{ protocolo: string }>("/solicitacoes", {
        method: "POST",
        body: JSON.stringify({
          descricao: String(fd.get("descricao")),
          setorNome: String(fd.get("setorNome")),
          urgencia: String(fd.get("urgencia")),
          equipamentoTag: String(fd.get("equipamentoTag") || "") || undefined,
          ramal: String(fd.get("ramal") || "") || undefined,
        }),
      });
      setOk(`Solicitação ${res.protocolo} registrada`);
      e.currentTarget.reset();
      await reload();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <PageHeader title="Abrir OS" subtitle="Solicitação de serviço para a engenharia clínica" />
      <Surface>
        <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 12 }}>
          <div>
            <FieldLabel>Setor</FieldLabel>
            <select name="setorNome" required defaultValue="" style={fieldStyle}>
              <option value="" disabled>
                Setor
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
            <FieldLabel>TAG do equipamento</FieldLabel>
            <input name="equipamentoTag" placeholder="TAG do equipamento (opcional)" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Descrição do problema</FieldLabel>
            <textarea name="descricao" placeholder="Descrição do problema" rows={4} style={fieldStyle} required />
          </div>
          <div>
            <FieldLabel>Urgência</FieldLabel>
            <select name="urgencia" defaultValue="MEDIA" style={fieldStyle}>
              <option value="BAIXA">Urgência: Baixa</option>
              <option value="MEDIA">Urgência: Média</option>
              <option value="ALTA">Urgência: Alta</option>
              <option value="PARADA_CRITICA">Parada de Equipamento Crítico</option>
            </select>
          </div>
          <div>
            <FieldLabel>Ramal</FieldLabel>
            <input name="ramal" placeholder="Ramal" style={fieldStyle} />
          </div>
          <Btn type="submit">Enviar solicitação</Btn>
          {ok && <div style={{ color: "oklch(0.45 0.13 150)", fontSize: 13, fontWeight: 600 }}>{ok}</div>}
          {erro && <Err>{erro}</Err>}
        </form>
      </Surface>

      <h2 style={{ marginTop: 28, fontSize: 16 }}>Recentes</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {minhas.map((s) => (
          <Surface key={s.id} style={{ padding: 12, fontSize: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong>{s.protocolo}</strong>
              <Badge tone={s.status}>{s.status}</Badge>
              {s.ordemServico && <span>{s.ordemServico.codigo}</span>}
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
