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
          color: "oklch(0.5 0.02 250)",
          fontFamily: "var(--aion-font-mobile)",
        }}
      >
        Carregando…
      </div>
    );
  }

  return <SessionProvider value={me}>{children}</SessionProvider>;
}
