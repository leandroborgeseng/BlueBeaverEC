"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { SessionProvider, type SessionMe } from "@/lib/session";
import { Loading } from "@/components/ui/aion-ui";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";
import { Dock } from "./Dock";
import { FloatingWindowLayer } from "./FloatingWindow";

function preferMobileShell() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem("aion_force_desktop") === "1") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

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
    // Técnico/engenheiro em viewport estreita → PWA campo
    const perfilCampo = me.perfil === "TECNICO" || me.perfil === "ENGENHEIRO" || me.perfil === "ADMIN";
    if (perfilCampo && preferMobileShell()) {
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
      <div style={{ minHeight: "100vh", display: "flex", background: "var(--aion-bg)" }}>
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
