"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { Btn, Err, PageHeader, Surface } from "@/components/ui/aion-ui";

interface Etiqueta {
  tag: string;
  nome: string;
  setor: string;
  patrimonio?: string | null;
  payload: string;
  svg: string;
}

export default function EtiquetaPage() {
  const params = useParams<{ tag: string }>();
  const tag = decodeURIComponent(params.tag);
  const [data, setData] = useState<Etiqueta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Etiqueta>(`/equipamentos/${encodeURIComponent(tag)}/etiqueta`)
      .then(setData)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [tag]);

  if (erro) return <Err>{erro}</Err>;
  if (!data) return <div style={{ color: "oklch(0.5 0.02 250)" }}>Gerando etiqueta…</div>;

  return (
    <div>
      <PageHeader
        title={`Etiqueta · ${data.tag}`}
        subtitle="QR autenticado: a leitura exige login. O código não é uma URL pública."
        actions={
          <Btn variant="secondary" onClick={() => window.print()}>
            Imprimir
          </Btn>
        }
      />
      <Surface style={{ maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{data.tag}</div>
        <div style={{ fontSize: 14, margin: "6px 0 12px" }}>{data.nome}</div>
        <div dangerouslySetInnerHTML={{ __html: data.svg }} />
        <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 10 }}>
          {data.setor}
          {data.patrimonio ? ` · pat. ${data.patrimonio}` : ""}
        </div>
        <div style={{ fontSize: 11, marginTop: 8, wordBreak: "break-all" }}>Consulta autenticada</div>
      </Surface>
    </div>
  );
}
