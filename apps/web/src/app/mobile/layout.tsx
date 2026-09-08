"use client";

import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { SessionProvider, type SessionMe } from "@/lib/session";

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<SessionMe | null>(null);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    api<SessionMe>("/session/me")
      .then(setMe)
      .catch(() => {
        window.location.href = "/login";
      });
  }, []);

  if (!me) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "var(--aion-bg-mobile)",
          color: "oklch(0.5 0.02 250)",
          fontFamily: "var(--aion-font-mobile)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "oklch(0.64 0.19 38)",
              margin: "0 auto 12px",
            }}
          />
          <div style={{ fontWeight: 700, fontSize: 14 }}>Aion Campo</div>
          <div style={{ fontSize: 12.5, marginTop: 4 }}>Carregando sessão…</div>
        </div>
      </div>
    );
  }

  return <SessionProvider value={me}>{children}</SessionProvider>;
}
