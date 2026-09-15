"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LABEL_SITUACAO_CICLO } from "@aion/shared";
import { useWindowStore } from "@/store/windows";
import {
  ToolBtn,
  WinScreen,
  ZebraTable,
  padCount,
  td,
  winFld,
  zebraRow,
} from "@/components/equipamentos/eq-win-ui";

interface Row {
  id: string;
  tag: string;
  nome: string;
  situacao: string;
  destino: string;
  setor: string;
  dataCriacao: string | null;
  dataAprovacao: string | null;
  osNumero: number | null;
  osCodigo: string | null;
  motivo: string | null;
}

function fmtDate(v?: string | null) {
  if (!v) return "";
  const [y, m, d] = v.split("-");
  if (!d) return v;
  return `${d}/${m}/${y}`;
}

export default function ObsolescenciaPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const open = useWindowStore((s) => s.open);

  useEffect(() => {
    api<Row[]>("/equipamentos/obsoletos")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(
      (r) =>
        r.tag.toLowerCase().includes(t) ||
        r.nome.toLowerCase().includes(t) ||
        (r.osCodigo ?? "").toLowerCase().includes(t) ||
        String(r.osNumero ?? "").includes(t),
    );
  }, [items, q]);

  return (
    <WinScreen
      title="Obsolescência"
      error={erro}
      toolbar={
        <>
          <ToolBtn
            onClick={() =>
              void api<Row[]>("/equipamentos/obsoletos")
                .then(setItems)
                .catch((e) => setErro(e instanceof Error ? e.message : "Erro"))
            }
          >
            Atualizar
          </ToolBtn>
        </>
      }
      filters={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12 }}>Buscar:</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} style={{ ...winFld, width: 260 }} />
        </div>
      }
      footer={<span style={{ marginLeft: "auto" }}>{padCount(filtrados.length)} itens</span>}
    >
      <ZebraTable
        columns={[
          { key: "tag", label: "TAG", width: 120 },
          { key: "os", label: "OS", width: 110 },
          { key: "dest", label: "Destino", width: 110 },
          { key: "nome", label: "Equipamento" },
          { key: "cri", label: "Data de criação", width: 120 },
          { key: "apr", label: "Data de aprovação", width: 130 },
          { key: "sit", label: "Situação", width: 140 },
        ]}
      >
        {filtrados.map((r, i) => (
          <tr
            key={r.id}
            style={zebraRow(i, r.id === selectedId)}
            onClick={() => setSelectedId(r.id)}
            onDoubleClick={() => open({ kind: "equipamento", title: r.tag, payload: { tag: r.tag } })}
          >
            <td style={td}>
              <strong>{r.tag}</strong>
            </td>
            <td
              style={td}
              onClick={(e) => {
                if (!r.osNumero) return;
                e.stopPropagation();
                open({
                  kind: "os",
                  title: `OS - ${r.osCodigo ?? r.osNumero}`,
                  payload: { numero: r.osNumero, codigo: r.osCodigo },
                });
              }}
            >
              {r.osCodigo ?? r.osNumero ?? ""}
            </td>
            <td style={td}>{r.destino}</td>
            <td style={td}>{r.nome}</td>
            <td style={td}>{fmtDate(r.dataCriacao)}</td>
            <td style={td}>{fmtDate(r.dataAprovacao)}</td>
            <td style={td}>
              {LABEL_SITUACAO_CICLO[r.situacao as keyof typeof LABEL_SITUACAO_CICLO] ?? r.situacao}
            </td>
          </tr>
        ))}
      </ZebraTable>
      {filtrados.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "#777", fontSize: 13 }}>
          Nenhum equipamento desativado ou arquivado.
        </div>
      )}
    </WinScreen>
  );
}
