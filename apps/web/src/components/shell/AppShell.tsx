"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PERMISSAO_NIVEL, temPermissao, type NivelPermissao } from "@aion/shared";
import { api, getToken } from "@/lib/api";
import {
  SessionProvider,
  destinoDesktop,
  preferMobileShell,
  perfilVaiParaMobile,
  type SessionMe,
} from "@/lib/session";
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

  useEffect(() => {
    if (!me) return;
    const mapa = me.permissoesModulos;
    const home = destinoDesktop(me.perfil);
    const L = PERMISSAO_NIVEL.LEITURA;
    const A = PERMISSAO_NIVEL.EDICAO_APROVACAO;
    const deny = (modulo: Parameters<typeof temPermissao>[1], minimo: NivelPermissao = L) =>
      !temPermissao(mapa, modulo, minimo);

    if (pathname.startsWith("/gestao/cronograma-manutencao")) {
      if (deny("os") && deny("estrategico")) router.replace(home);
      return;
    }
    if (pathname.startsWith("/cadastros") && deny("equipamentos", A)) {
      router.replace(home);
      return;
    }

    const guards: Array<[string, Parameters<typeof temPermissao>[1]]> = [
      ["/os", "os"],
      ["/config", "config"],
      ["/equipamentos", "equipamentos"],
      ["/laudos", "laudos"],
      ["/procedimentos-laudo", "laudos"],
      ["/instrumentos", "laudos"],
      ["/certificados", "laudos"],
      ["/biblioteca-pops", "laudos"],
      ["/estoque", "estoque"],
      ["/financeiro", "financeiro"],
      ["/contratos", "contratos"],
      ["/pessoas", "pessoas"],
      ["/auditorias", "auditorias"],
      ["/qualidade", "auditorias"],
      ["/gestao", "estrategico"],
      ["/dashboard", "dashboard"],
      ["/portal", "portal"],
    ];
    for (const [prefix, modulo] of guards) {
      if (pathname.startsWith(prefix) && deny(modulo)) {
        router.replace(home);
        return;
      }
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
