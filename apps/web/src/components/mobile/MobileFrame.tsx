"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useOfflineQueue } from "@/lib/offline-queue";

export function MobileFrame({
  title,
  children,
  online,
  pending,
  onSync,
}: {
  title: string;
  children: React.ReactNode;
  online: boolean;
  pending: number;
  onSync?: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const { lastSyncMsg, clearSyncMsg, hydrate } = useOfflineQueue();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!lastSyncMsg) return;
    const t = setTimeout(() => clearSyncMsg(), 4000);
    return () => clearTimeout(t);
  }, [lastSyncMsg, clearSyncMsg]);

  return (
    <div
      style={{
        minHeight: "100vh",
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--aion-bg-mobile)",
        fontFamily: "var(--aion-font-mobile)",
        padding: "14px 14px 88px",
        color: "oklch(0.22 0.02 250)",
      }}
    >
      {!online && (
        <div
          onClick={() => onSync && void onSync()}
          style={{
            flexShrink: 0,
            background: "oklch(0.55 0.16 38)",
            color: "white",
            padding: "7px 14px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11.5,
            fontWeight: 600,
            borderRadius: 8,
            marginBottom: 10,
            cursor: onSync ? "pointer" : "default",
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "white",
              flexShrink: 0,
            }}
          />
          Offline · {pending > 0 ? `${pending} pendente(s)` : "fila vazia"}
          {pending > 0 && online ? " · tocar para sync" : ""}
        </div>
      )}
      {online && pending > 0 && (
        <div
          style={{
            background: "oklch(0.93 0.09 150)",
            color: "oklch(0.4 0.13 150)",
            padding: "6px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 7,
            fontSize: 11.5,
            fontWeight: 600,
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          <span>{pending} item(ns) prontos para sincronizar</span>
          {onSync && (
            <button
              type="button"
              onClick={() => void onSync()}
              style={{
                border: "none",
                background: "oklch(0.64 0.19 38)",
                color: "white",
                borderRadius: 7,
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Sync
            </button>
          )}
        </div>
      )}
      {online && pending === 0 && (
        <div
          style={{
            background: "white",
            borderBottom: "1px solid oklch(0.93 0.005 255)",
            color: "oklch(0.55 0.02 250)",
            padding: "5px 4px 10px",
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 10.5,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "oklch(0.6 0.14 150)" }} />
          Online · {title}
        </div>
      )}

      {lastSyncMsg && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            background: "oklch(0.93 0.05 145)",
            color: "oklch(0.35 0.1 145)",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {lastSyncMsg}
        </div>
      )}
      {children}
      <nav
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 12,
          width: "min(448px, calc(100% - 24px))",
          background: "white",
          border: "1px solid oklch(0.91 0.006 255)",
          borderRadius: 16,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          padding: 6,
          boxShadow: "0 12px 30px -18px rgba(0,0,0,.4)",
          zIndex: 30,
        }}
      >
        {[
          ["/mobile", "Início"],
          ["/mobile/os", "OS"],
          ["/mobile/qr", "QR"],
          ["/mobile/solicitar", "Solicitar"],
        ].map(([href, label]) => {
          const active =
            href === "/mobile" ? pathname === "/mobile" : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              style={{
                textAlign: "center",
                fontSize: 12,
                fontWeight: 700,
                padding: "10px 4px",
                borderRadius: 12,
                color: active ? "oklch(0.64 0.19 38)" : "oklch(0.4 0.02 250)",
                background: active ? "oklch(0.96 0.03 55)" : "transparent",
                textDecoration: "none",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
