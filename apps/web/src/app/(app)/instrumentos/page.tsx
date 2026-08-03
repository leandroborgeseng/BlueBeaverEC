"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/nexo-ui";

interface Inst {
  id: string;
  nome: string;
  nSerie: string;
  fabricante?: string | null;
  modelo?: string | null;
  grandezas: string[];
  certificadoValidade?: string | null;
  laboratorioEmissor?: string | null;
  certificadosCount: number;
  pontosVigente: number;
  statusCertificado: string;
  vencido: boolean;
  selecionavel: boolean;
}

export default function InstrumentosPage() {
  const [items, setItems] = useState<Inst[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    setItems(await api<Inst[]>("/instrumentos-padroes"));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const grandezas = String(fd.get("grandezas") || "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const created = await api<{ id: string }>("/instrumentos-padroes", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          nSerie: String(fd.get("nSerie")),
          fabricante: String(fd.get("fabricante") || "") || undefined,
          modelo: String(fd.get("modelo") || "") || undefined,
          grandezas: grandezas.length ? grandezas : undefined,
          faixaMedicao: String(fd.get("faixaMedicao") || "") || undefined,
          resolucao: String(fd.get("resolucao") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Padrão cadastrado — cadastre o certificado na ficha");
      await load();
      window.location.href = `/instrumentos/${created.id}`;
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader
        title="Instrumentos e Padrões"
        subtitle="Cadastre padrões e o histórico de certificados RBC (pontos, U e PDF) para os cálculos de calibração"
      />
      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)", marginBottom: 12 }}>
          {msg}
        </div>
      )}

      <Surface style={{ marginBottom: 16 }}>
        <form
          onSubmit={(e) => void onCreate(e)}
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}
        >
          <div>
            <FieldLabel>Nome</FieldLabel>
            <input name="nome" placeholder="Ex.: Termômetro digital" required style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Nº série</FieldLabel>
            <input name="nSerie" placeholder="Nº série" required style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Fabricante</FieldLabel>
            <input name="fabricante" placeholder="Fabricante" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Modelo</FieldLabel>
            <input name="modelo" placeholder="Modelo" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Grandezas</FieldLabel>
            <input
              name="grandezas"
              placeholder="temperatura, umidade"
              style={fieldStyle}
            />
          </div>
          <div>
            <FieldLabel>Faixa de medição</FieldLabel>
            <input name="faixaMedicao" placeholder="0 a 70 °C" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Resolução</FieldLabel>
            <input name="resolucao" placeholder="0,1 °C" style={fieldStyle} />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <Btn type="submit">Cadastrar padrão</Btn>
          </div>
        </form>
      </Surface>

      <DataTable>
        <thead>
          <tr>
            <th style={th}>Padrão</th>
            <th style={th}>Nº série</th>
            <th style={th}>Grandezas</th>
            <th style={th}>Validade</th>
            <th style={th}>Pontos U</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} style={td}>
                <Empty text="Nenhum padrão cadastrado." />
              </td>
            </tr>
          ) : (
            items.map((i) => (
              <tr key={i.id}>
                <td style={td}>
                  <Link href={`/instrumentos/${i.id}`} style={{ fontWeight: 700, color: "inherit" }}>
                    {i.nome}
                  </Link>
                  {(i.fabricante || i.modelo) && (
                    <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                      {[i.fabricante, i.modelo].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td style={td}>{i.nSerie}</td>
                <td style={td}>{i.grandezas?.length ? i.grandezas.join(", ") : "—"}</td>
                <td style={td}>
                  {i.certificadoValidade
                    ? new Date(i.certificadoValidade).toLocaleDateString("pt-BR")
                    : "—"}
                </td>
                <td style={td}>
                  {i.pontosVigente}/{i.certificadosCount} cert.
                </td>
                <td style={td}>
                  <Badge tone={i.statusCertificado === "VALIDO" ? "VALIDO" : i.statusCertificado === "A_VENCER" ? "A_VENCER" : "VENCIDO"}>
                    {i.statusCertificado === "SEM_CERTIFICADO"
                      ? "Sem certificado"
                      : i.statusCertificado.replace("_", " ")}
                  </Badge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
