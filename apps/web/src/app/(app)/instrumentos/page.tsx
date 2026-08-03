"use client";

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
  certificadoValidade?: string | null;
  vencido: boolean;
  selecionavel: boolean;
  laboratorioEmissor?: string | null;
}

export default function InstrumentosPage() {
  const [items, setItems] = useState<Inst[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setItems(await api<Inst[]>("/instrumentos-padroes"));
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/instrumentos-padroes", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          nSerie: String(fd.get("nSerie")),
          certificadoNumero: String(fd.get("certificadoNumero") || "") || undefined,
          certificadoValidade: String(fd.get("certificadoValidade") || "") || undefined,
          laboratorioEmissor: String(fd.get("laboratorioEmissor") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Instrumento cadastrado");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader title="Instrumentos e Padrões" subtitle="Certificado vencido bloqueia uso em novos laudos" />
      {msg && <Err>{msg}</Err>}

      <Surface style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => void onCreate(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <FieldLabel>Nome</FieldLabel>
            <input name="nome" placeholder="Nome" required style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Nº série</FieldLabel>
            <input name="nSerie" placeholder="Nº série" required style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Certificado</FieldLabel>
            <input name="certificadoNumero" placeholder="Certificado" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Validade</FieldLabel>
            <input name="certificadoValidade" type="date" style={fieldStyle} />
          </div>
          <Btn type="submit">+</Btn>
        </form>
      </Surface>

      <DataTable>
        <thead>
          <tr>
            <th style={th}>Nome</th>
            <th style={th}>Nº série</th>
            <th style={th}>Validade</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={4} style={td}><Empty /></td>
            </tr>
          ) : (
            items.map((i) => (
              <tr key={i.id}>
                <td style={td}><strong>{i.nome}</strong></td>
                <td style={td}>{i.nSerie}</td>
                <td style={td}>
                  {i.certificadoValidade
                    ? new Date(i.certificadoValidade).toLocaleDateString("pt-BR")
                    : "—"}
                </td>
                <td style={td}>
                  <Badge tone={i.vencido ? "VENCIDO" : "VALIDO"}>
                    {i.vencido ? "Certificado vencido" : "Selecionável"}
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
