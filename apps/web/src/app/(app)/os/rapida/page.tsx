"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Btn,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
} from "@/components/ui/nexo-ui";

interface Colaborador {
  id: string;
  nome: string;
}

interface EstoqueItem {
  codigo: string;
  descricao: string;
}

export default function OsRapidaPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [cols, setCols] = useState<Colaborador[]>([]);
  const [pecas, setPecas] = useState<EstoqueItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<Colaborador[]>("/colaboradores"),
      api<EstoqueItem[]>("/estoque/itens"),
    ]).then(([c, e]) => {
      setCols(c);
      setPecas(e);
    });
  }, []);

  async function onTagBlur(tag: string) {
    if (!tag.trim()) return;
    try {
      const ativas = await api<Array<{ numero: number }>>(
        `/os/equipamento/${encodeURIComponent(tag.trim())}/ativas`,
      );
      setAviso(
        ativas.length
          ? `Já existe OS #${ativas.map((a) => a.numero).join(", ")} em aberto`
          : null,
      );
    } catch {
      setAviso(null);
    }
  }

  async function submit(fechar: boolean) {
    const form = formRef.current;
    if (!form) return;
    setErro(null);
    const fd = new FormData(form);
    const pecaCodigo = String(fd.get("pecaCodigo") || "");
    const body: Record<string, unknown> = {
      equipamentoTag: String(fd.get("equipamentoTag")),
      tipo: String(fd.get("tipo")),
      prioridade: String(fd.get("prioridade")),
      oficina: String(fd.get("oficina") || "") || undefined,
      observacaoRequisicao: String(fd.get("ocorrencia") || "") || undefined,
      responsavelId: String(fd.get("responsavelId") || "") || undefined,
      servicoExecutado: String(fd.get("servicoExecutado") || "") || undefined,
      deslocamentoKm: Number(fd.get("deslocamentoKm") || 0) || undefined,
      fechar,
    };
    const horas = Number(fd.get("horas") || 0);
    if (horas > 0) {
      body.maoDeObra = {
        descricao: String(fd.get("maoDeObraDesc") || "Mão de obra"),
        horas,
        valorHora: Number(fd.get("valorHora") || 0) || undefined,
      };
    }
    if (pecaCodigo) {
      body.pecas = [{ itemCodigo: pecaCodigo, qtd: Number(fd.get("pecaQtd") || 1) }];
    }
    try {
      const res = await api<{ codigo: string; fechada?: boolean }>("/os/rapida", {
        method: "POST",
        body: JSON.stringify(body),
      });
      window.alert(`${res.codigo} ${res.fechada ? "criada e fechada" : "criada (aberta)"}`);
      router.push("/os");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader title="OS Rápida" subtitle="Abertura + execução em um passo · Fechar ou deixar aberta" />
      {aviso && <div style={{ marginBottom: 10, color: "oklch(0.55 0.14 85)", fontWeight: 700 }}>{aviso}</div>}
      {erro && <Err>{erro}</Err>}

      <Surface style={{ maxWidth: 640 }}>
        <form
          ref={formRef}
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void submit(false);
          }}
          style={{ display: "grid", gap: 10 }}
        >
          <div>
            <FieldLabel>TAG do equipamento</FieldLabel>
            <input
              name="equipamentoTag"
              placeholder="TAG do equipamento"
              required
              style={fieldStyle}
              onBlur={(e) => void onTagBlur(e.target.value)}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <FieldLabel>Tipo</FieldLabel>
              <select name="tipo" defaultValue="CORRETIVA" style={fieldStyle}>
                <option value="CORRETIVA">Corretiva</option>
                <option value="PREVENTIVA">Preventiva</option>
                <option value="CALIBRACAO">Calibração</option>
                <option value="TSE">TSE</option>
              </select>
            </div>
            <div>
              <FieldLabel>Prioridade</FieldLabel>
              <select name="prioridade" defaultValue="MEDIA" style={fieldStyle}>
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
          </div>
          <div>
            <FieldLabel>Oficina</FieldLabel>
            <input name="oficina" placeholder="Oficina" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Responsável</FieldLabel>
            <select name="responsavelId" style={fieldStyle}>
              <option value="">Responsável…</option>
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Ocorrência / reclamação</FieldLabel>
            <textarea name="ocorrencia" placeholder="Ocorrência / reclamação" rows={2} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Serviço executado</FieldLabel>
            <textarea name="servicoExecutado" placeholder="Serviço executado (Interno/Externo)" rows={2} style={fieldStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
            <div>
              <FieldLabel>Mão de obra</FieldLabel>
              <input name="maoDeObraDesc" placeholder="Mão de obra (descrição)" defaultValue="Mão de obra técnica" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Horas</FieldLabel>
              <input name="horas" type="number" step="0.25" min="0" placeholder="Horas" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>R$/h</FieldLabel>
              <input name="valorHora" type="number" step="0.01" min="0" placeholder="R$/h" style={fieldStyle} />
            </div>
          </div>
          <div>
            <FieldLabel>Deslocamento (km)</FieldLabel>
            <input name="deslocamentoKm" type="number" min="0" step="0.1" placeholder="Deslocamento (km)" style={fieldStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <div>
              <FieldLabel>Peça (opcional)</FieldLabel>
              <select name="pecaCodigo" style={fieldStyle}>
                <option value="">Peça (opcional)</option>
                {pecas.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.codigo} — {p.descricao}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Qtd</FieldLabel>
              <input name="pecaQtd" type="number" min="0.01" step="0.01" defaultValue={1} style={fieldStyle} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn type="submit" variant="ghost">
              Deixar OS aberta
            </Btn>
            <Btn type="button" onClick={() => void submit(true)}>
              Fechar OS
            </Btn>
          </div>
        </form>
      </Surface>
    </div>
  );
}
