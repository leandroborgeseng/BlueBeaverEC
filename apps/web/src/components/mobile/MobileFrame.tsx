"use client";

import Link from "next/link";
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
        background: "oklch(0.97 0.01 250)",
        padding: "16px 16px 88px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <strong style={{ fontSize: 20 }}>{title}</strong>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 700,
            color: online ? "var(--nexo-success)" : "var(--nexo-warning)",
          }}
        >
          {online ? "Online" : "Offline"}
          {pending > 0 ? ` · ${pending} pend.` : ""}
        </span>
        {pending > 0 && online && onSync && (
          <button
            type="button"
            onClick={() => void onSync()}
            style={{
              border: "none",
              background: "var(--nexo-brand)",
              color: "white",
              borderRadius: 8,
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            Sync
          </button>
        )}
      </div>
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
          border: "1px solid var(--nexo-border)",
          borderRadius: 16,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          padding: 8,
          boxShadow: "0 12px 30px -18px rgba(0,0,0,.4)",
          zIndex: 30,
        }}
      >
        {[
          ["/mobile", "Início"],
          ["/mobile/os", "OS"],
          ["/mobile/qr", "QR"],
          ["/mobile/solicitar", "Solicitar"],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            style={{ textAlign: "center", fontSize: 12, fontWeight: 700, padding: "8px 4px" }}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
