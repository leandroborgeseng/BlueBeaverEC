"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/qualidade", label: "Busca" },
  { href: "/qualidade/documentos", label: "Documentos" },
  { href: "/qualidade/treinamentos", label: "Treinamentos" },
  { href: "/qualidade/ocorrencias", label: "Ocorrências" },
  { href: "/qualidade/alertas", label: "Alertas de campo" },
];

export function QualidadeTabs() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      {TABS.map((t) => {
        const active = t.href === "/qualidade" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            style={{
              padding: "7px 12px",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              color: active ? "oklch(0.35 0.14 255)" : "oklch(0.4 0.02 250)",
              background: active ? "oklch(0.95 0.03 255)" : "white",
              border: `1px solid ${active ? "oklch(0.82 0.06 255)" : "oklch(0.91 0.006 255)"}`,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Falha ao ler arquivo"));
    r.readAsDataURL(file);
  });
}

export function fmtData(v?: string | Date | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}
