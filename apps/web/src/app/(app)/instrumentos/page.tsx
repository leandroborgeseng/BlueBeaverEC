"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Overlay, WinForm, fld } from "@/components/os/os-win-ui";
import {
  FItem,
  FRow,
  ToolBtn,
  WinScreen,
  ZebraTable,
  padCount,
  td,
  winFld,
  zebraRow,
} from "@/components/equipamentos/eq-win-ui";

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

function fmtDate(v?: string | null) {
  if (!v) return "";
  return new Date(v).toLocaleDateString("pt-BR");
}

export default function InstrumentosPage() {
  const router = useRouter();
  const [items, setItems] = useState<Inst[]>([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setItems(await api<Inst[]>("/instrumentos-padroes"));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(
      (i) =>
        i.nome.toLowerCase().includes(t) ||
        i.nSerie.toLowerCase().includes(t) ||
        (i.fabricante ?? "").toLowerCase().includes(t) ||
        (i.modelo ?? "").toLowerCase().includes(t),
    );
  }, [items, q]);

  const selected = filtrados.find((i) => i.id === selectedId) ?? null;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget as HTMLFormElement);
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
          tipoAnalisador: String(fd.get("tipoAnalisador") || "") || undefined,
        }),
      });
      setNovo(false);
      await load();
      router.push(`/instrumentos/${created.id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <WinScreen
        title="Rastreabilidade dos Padrões"
        error={erro}
        toolbar={
          <>
            <ToolBtn onClick={() => setNovo(true)}>Novo</ToolBtn>
            <ToolBtn disabled={!selected} onClick={() => selected && router.push(`/instrumentos/${selected.id}`)}>
              Alterar
            </ToolBtn>
            <ToolBtn disabled={!selected} onClick={() => selected && router.push(`/instrumentos/${selected.id}`)}>
              Consultar
            </ToolBtn>
          </>
        }
        filters={
          <FRow>
            <FItem label="Pesquisar:" grow>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Todo ou parte do nome"
                style={{ ...winFld, flex: 1 }}
              />
            </FItem>
            <span style={{ fontSize: 12, color: "#555" }}>No campo: Descrição</span>
          </FRow>
        }
        footer={<span style={{ marginLeft: "auto" }}>Exibindo {padCount(filtrados.length)} registros</span>}
      >
        <ZebraTable
          columns={[
            { key: "desc", label: "Descrição" },
            { key: "serie", label: "Nº série", width: 140 },
            { key: "val", label: "Validade", width: 110 },
          ]}
        >
          {filtrados.map((i, idx) => (
            <tr
              key={i.id}
              style={zebraRow(idx, i.id === selectedId)}
              onClick={() => setSelectedId(i.id)}
              onDoubleClick={() => router.push(`/instrumentos/${i.id}`)}
            >
              <td style={td}>
                <Link href={`/instrumentos/${i.id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>
                  {i.nome}
                </Link>
              </td>
              <td style={td}>{i.nSerie}</td>
              <td style={td}>{fmtDate(i.certificadoValidade)}</td>
            </tr>
          ))}
        </ZebraTable>
        {filtrados.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "#777", fontSize: 13 }}>Nenhum padrão cadastrado.</div>
        )}
      </WinScreen>

      {novo && (
        <Overlay onClose={() => setNovo(false)} fixed>
          <WinForm
            title="Novo padrão"
            width="min(520px, 96vw)"
            onSubmit={(e) => void onCreate(e)}
            onCancel={() => setNovo(false)}
            busy={busy}
            showContinuar={false}
            submitLabel="Cadastrar"
          >
            <label style={lab}>Nome</label>
            <input name="nome" required style={{ ...fld, width: "100%", marginBottom: 8 }} />
            <label style={lab}>Nº série</label>
            <input name="nSerie" required style={{ ...fld, width: "100%", marginBottom: 8 }} />
            <label style={lab}>Fabricante</label>
            <input name="fabricante" style={{ ...fld, width: "100%", marginBottom: 8 }} />
            <label style={lab}>Modelo</label>
            <input name="modelo" style={{ ...fld, width: "100%", marginBottom: 8 }} />
            <label style={lab}>Grandezas</label>
            <input name="grandezas" placeholder="temperatura, umidade" style={{ ...fld, width: "100%", marginBottom: 8 }} />
            <label style={lab}>Faixa de medição</label>
            <input name="faixaMedicao" style={{ ...fld, width: "100%", marginBottom: 8 }} />
            <label style={lab}>Resolução</label>
            <input name="resolucao" style={{ ...fld, width: "100%", marginBottom: 8 }} />
            <label style={lab}>Tipo de analisador</label>
            <input name="tipoAnalisador" placeholder="segurança elétrica, infusão" style={{ ...fld, width: "100%", marginBottom: 8 }} />
          </WinForm>
        </Overlay>
      )}
    </>
  );
}

const lab = { display: "block", fontSize: 12, marginBottom: 4 } as const;
