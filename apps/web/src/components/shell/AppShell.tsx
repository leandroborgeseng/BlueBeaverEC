"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { SessionProvider, type SessionMe } from "@/lib/session";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";
import { Dock } from "./Dock";
import { FloatingWindowLayer } from "./FloatingWindow";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<SessionMe | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<SessionMe>("/session/me")
      .then(setMe)
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!me) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--nexo-muted)" }}>
        Carregando sessão…
      </div>
    );
  }

  return (
    <SessionProvider value={me}>
      <div style={{ minHeight: "100vh", display: "flex", background: "var(--nexo-bg)" }}>
        <SideRail />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <TopBar
            nome={me.nome}
            estabelecimentoId={me.estabelecimentoId}
            estabelecimentoNome={me.estabelecimentoNome}
            perfil={me.perfil}
            estabelecimentos={me.estabelecimentos}
          />
          <main style={{ flex: 1, padding: "26px 28px 56px", position: "relative", overflow: "auto" }}>
            {children}
          </main>
        </div>
        <FloatingWindowLayer />
        <Dock />
      </div>
    </SessionProvider>
  );
}
