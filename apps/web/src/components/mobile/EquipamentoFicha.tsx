"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchBlob } from "@/lib/api";
import { alertasFicha, type FichaCampo } from "@/lib/mobile-ficha";
import { cardStyle } from "./ui";

function Campo({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ color: "oklch(0.55 0.02 250)", fontWeight: 700, fontSize: 11.5 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>{value?.trim() || "—"}</div>
    </div>
  );
}

export function EquipamentoFicha({
  ficha,
  podeFoto,
  mostrarLinkOs = true,
}: {
  ficha: FichaCampo;
  podeFoto?: boolean;
  mostrarLinkOs?: boolean;
}) {
  const alertas = alertasFicha(ficha);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!podeFoto || !ficha.fotoDocumentoId || !ficha.tag) return;
    let alive = true;
    let created: string | null = null;
    void fetchBlob(`/equipamentos/${encodeURIComponent(ficha.tag)}/documentos/${ficha.fotoDocumentoId}`)
      .then((blob) => {
        if (!alive) return;
        created = URL.createObjectURL(blob);
        setFotoUrl(created);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [podeFoto, ficha.fotoDocumentoId, ficha.tag]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {alertas.map((a) => (
        <div
          key={a.texto}
          style={{
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 650,
            lineHeight: 1.4,
            background: a.tom === "danger" ? "oklch(0.95 0.04 25)" : "oklch(0.95 0.04 250)",
            color: a.tom === "danger" ? "oklch(0.42 0.16 25)" : "oklch(0.38 0.1 250)",
          }}
        >
          {a.texto}
        </div>
      ))}

      <div style={cardStyle}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: "oklch(0.5 0.02 250)", marginBottom: 8 }}>
          FOTO DO EQUIPAMENTO
        </div>
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt={ficha.tag} style={{ width: "100%", borderRadius: 12, maxHeight: 220, objectFit: "cover" }} />
        ) : (
          <div
            style={{
              height: 120,
              borderRadius: 12,
              background: "oklch(0.96 0.01 250)",
              display: "grid",
              placeItems: "center",
              color: "oklch(0.55 0.02 250)",
              fontSize: 13,
              fontWeight: 650,
            }}
          >
            Sem foto
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: "oklch(0.5 0.02 250)", marginBottom: 12 }}>
          IDENTIFICAÇÃO DO EQUIPAMENTO
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <Campo label="TAG" value={ficha.tag} />
          <Campo label="Nome" value={ficha.nome} />
          <Campo label="Plano de descrição" value={ficha.planoDescricao} />
          <Campo label="Modelo" value={ficha.modelo} />
          <Campo label="Fabricante" value={ficha.fabricante} />
          <Campo label="Número de série" value={ficha.nSerie} />
          <Campo label="Patrimônio" value={ficha.patrimonio} />
          <Campo label="Setor" value={ficha.setor} />
          <Campo label="Localização" value={ficha.localizacao} />
          <Campo label="Localização física" value={ficha.localizacaoFisica} />
          <Campo label="Situação" value={ficha.situacao} />
        </div>
      </div>

      {mostrarLinkOs && (
      <Link
        href={`/mobile/qr?codigo=${encodeURIComponent(ficha.tag)}`}
        style={{ fontSize: 13, fontWeight: 700, color: "oklch(0.45 0.14 255)", textDecoration: "none" }}
      >
        Ver OS abertas deste equipamento →
      </Link>
      )}
    </div>
  );
}
