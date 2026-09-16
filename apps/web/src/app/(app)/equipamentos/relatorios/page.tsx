"use client";

import { useEffect, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import { ToolBtn, WinScreen, zebraRow } from "@/components/equipamentos/eq-win-ui";

interface Tpl {
  codigo: string;
  nome: string;
  descricao: string;
}

const ORDEM = [
  "inventario_equipamentos",
  "custos_manutencao",
  "calendario_manutencao",
  "resumo_mensal",
  "conformidade",
  "maturidade",
  "indicadores_gestor",
];

export default function RelatoriosEquipamentosPage() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<Tpl[]>("/relatorios/templates")
      .then((t) =>
        setTemplates(
          [...t].sort((a, b) => {
            const ia = ORDEM.indexOf(a.codigo);
            const ib = ORDEM.indexOf(b.codigo);
            return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
          }),
        ),
      )
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  async function gerar(codigo: string, formato: "pdf" | "xlsx") {
    setBusy(`${codigo}:${formato}`);
    setErro(null);
    setMsg(null);
    try {
      await downloadApi(
        "/relatorios/gerar",
        { method: "POST", body: JSON.stringify({ template: codigo, formato }) },
        `${codigo}.${formato}`,
      );
      setMsg(`Download: ${codigo}.${formato}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <WinScreen
      title="Relatórios"
      error={erro}
      toolbar={msg ? <span style={{ fontSize: 12, color: "#2a7a2a" }}>{msg}</span> : undefined}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>Relatório</th>
            <th style={th}>Descrição</th>
            <th style={{ ...th, width: 180 }}>Exportar</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t, i) => (
            <tr key={t.codigo} style={zebraRow(i, false, { cursor: "default" })}>
              <td style={tdCell}>{t.nome}</td>
              <td style={tdCell}>{t.descricao}</td>
              <td style={tdCell}>
                <ToolBtn disabled={busy === `${t.codigo}:pdf`} onClick={() => void gerar(t.codigo, "pdf")}>
                  PDF
                </ToolBtn>
                <ToolBtn disabled={busy === `${t.codigo}:xlsx`} onClick={() => void gerar(t.codigo, "xlsx")}>
                  XLSX
                </ToolBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {templates.length === 0 && !erro && (
        <div style={{ padding: 24, color: "#777", fontSize: 13 }}>Nenhum relatório disponível.</div>
      )}
    </WinScreen>
  );
}

const th = {
  background: "#7a7a7a",
  color: "white",
  textAlign: "left" as const,
  padding: "5px 8px",
  fontWeight: 600,
};
const tdCell = { padding: "8px", borderBottom: "1px solid #f0f0f0" };
