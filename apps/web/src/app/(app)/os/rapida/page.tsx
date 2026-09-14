"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { labelResponsavel } from "@/lib/session";
import {
  Btn,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface Colaborador {
  id: string;
  nome: string;
  funcao?: string | null;
  cargo?: string | null;
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      api<Colaborador[]>("/os/responsaveis"),
      api<{ items: EstoqueItem[] }>("/estoque/itens?pageSize=100"),
    ]).then(([c, e]) => {
      setCols(c);
      setPecas(e.items);
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
    if (!form || busy) return;
    setErro(null);
    setBusy(true);
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
      resultadoAtendimento: String(fd.get("resultadoAtendimento") || "") || undefined,
      condicaoFinal: String(fd.get("condicaoFinal") || "") || undefined,
      deslocamentoKm: Number(fd.get("deslocamentoKm") || 0) || undefined,
      fechar,
    };
    const horas = Number(fd.get("horas") || 0);
    if (horas > 0) {
      body.maoDeObra = {
        descricao: String(fd.get("maoDeObraDesc") || "Mão de obra"),
        horas,
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
      setErro(err instanceof Error ? err.message : "Não foi possível gravar. Tente de novo — o duplo clique não abre duas OS.");
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="OS rápida"
        subtitle={
          <span>
            Abertura + execução em um passo ·{" "}
            <Link href="/os/nova" style={{ color: "oklch(0.45 0.14 255)", fontWeight: 600 }}>
              formulário completo
            </Link>
          </span>
        }
      />
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
                <option value="QUALIFICACAO">Qualificação</option>
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
                  {labelResponsavel(c)}
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
          <div>
            <FieldLabel>Resultado do atendimento</FieldLabel>
            <textarea name="resultadoAtendimento" placeholder="O que ficou resolvido ou pendente" rows={2} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Condição final do equipamento</FieldLabel>
            <select name="condicaoFinal" defaultValue="" style={fieldStyle}>
              <option value="">Selecione se for fechar a OS…</option>
              <option value="APTO">Apto para uso</option>
              <option value="RESTRITO">Uso restrito</option>
              <option value="PARADO">Parado</option>
            </select>
            <div style={{ marginTop: 6, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
              Fechar a OS não marca o equipamento como apto sozinho. Escolha a condição.
            </div>
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
          </div>
          <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: -4 }}>
            O R$/h só entra se estiver configurado na organização e você tiver acesso financeiro.
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
            <Btn type="submit" variant="ghost" disabled={busy}>
              {busy ? "Aguarde…" : "Deixar OS aberta"}
            </Btn>
            <Btn type="button" disabled={busy} onClick={() => void submit(true)}>
              {busy ? "Aguarde — gravando…" : "Fechar OS"}
            </Btn>
          </div>
        </form>
      </Surface>
    </div>
  );
}
