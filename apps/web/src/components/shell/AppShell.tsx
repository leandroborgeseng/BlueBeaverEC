"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { SessionProvider, preferMobileShell, perfilVaiParaMobile, type SessionMe } from "@/lib/session";
import { Loading } from "@/components/ui/aion-ui";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";
import { Dock } from "./Dock";
import { FloatingWindowLayer } from "./FloatingWindow";
import { ImpersonationBanner } from "./ImpersonationBanner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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

  useEffect(() => {
    if (!me) return;
    if (pathname.startsWith("/mobile")) return;
    if (perfilVaiParaMobile(me.perfil) && preferMobileShell()) {
      router.replace("/mobile");
    }
  }, [me, pathname, router]);

  if (!me) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Loading text="Carregando sessão…" />
      </div>
    );
  }

  return (
    <SessionProvider value={me}>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--aion-bg)" }}>
        <ImpersonationBanner />
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
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
        </div>
        <FloatingWindowLayer />
        <Dock />
      </div>
    </SessionProvider>
  );
}
