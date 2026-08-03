"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
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
}

interface EstoqueItem {
  codigo: string;
  descricao: string;
  disponivel: number;
}

export default function NovaOsPage() {
  const router = useRouter();
  const [cols, setCols] = useState<Colaborador[]>([]);
  const [pecas, setPecas] = useState<EstoqueItem[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pecaCodigo, setPecaCodigo] = useState("");
  const [pecaQtd, setPecaQtd] = useState(1);

  useEffect(() => {
    void Promise.all([
      api<Colaborador[]>("/colaboradores"),
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
          ? `Já existe OS #${ativas.map((a) => a.numero).join(", ")} em aberto para este equipamento`
          : null,
      );
    } catch {
      setAviso(null);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      equipamentoTag: String(fd.get("equipamentoTag")),
      tipo: String(fd.get("tipo")),
      prioridade: String(fd.get("prioridade")),
      oficina: String(fd.get("oficina") || "") || undefined,
      observacaoRequisicao: String(fd.get("observacaoRequisicao") || "") || undefined,
      pendencia: String(fd.get("pendencia") || "") || undefined,
      responsavelId: String(fd.get("responsavelId") || "") || undefined,
    };
    if (pecaCodigo) {
      body.pecas = [{ itemCodigo: pecaCodigo, qtd: pecaQtd }];
    }
    try {
      const res = await api<{
        codigo: string;
        avisoDuplicidade?: string | null;
        alertaCriticoUrgente?: string | null;
      }>("/os", { method: "POST", body: JSON.stringify(body) });
      const notes = [res.avisoDuplicidade, res.alertaCriticoUrgente].filter(Boolean).join(" · ");
      window.alert(`${res.codigo} criada${notes ? `\n${notes}` : ""}`);
      router.push("/os");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <PageHeader
        title="Nova OS"
        subtitle={
          <span>
            Duplicidade não bloqueia · peça reserva estoque até fechar/cancelar ·{" "}
            <Link href="/os/rapida" style={{ color: "oklch(0.45 0.14 255)", fontWeight: 600 }}>
              fluxo rápido
            </Link>
          </span>
        }
      />

      <Surface>
        <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 12 }}>
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
          {aviso && (
            <div style={{ background: "oklch(0.97 0.05 85)", borderRadius: 10, padding: 10, fontSize: 13 }}>
              {aviso}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
            <select name="responsavelId" defaultValue="" style={fieldStyle}>
              <option value="">Sem responsável (Não Atribuída)</option>
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Ocorrência / observação</FieldLabel>
            <textarea name="observacaoRequisicao" placeholder="Ocorrência / observação" rows={3} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Pendência</FieldLabel>
            <input name="pendencia" placeholder="Pendência (bloqueia fechamento se preenchida)" style={fieldStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
            <div>
              <FieldLabel>Peça (opcional)</FieldLabel>
              <select value={pecaCodigo} onChange={(e) => setPecaCodigo(e.target.value)} style={fieldStyle}>
                <option value="">Peça (opcional)</option>
                {pecas.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.codigo} — {p.descricao} (disp. {p.disponivel})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Quantidade</FieldLabel>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={pecaQtd}
                onChange={(e) => setPecaQtd(Number(e.target.value))}
                style={fieldStyle}
              />
            </div>
          </div>

          {erro && <Err>{erro}</Err>}
          <Btn type="submit">Abrir OS</Btn>
        </form>
      </Surface>
    </div>
  );
}
