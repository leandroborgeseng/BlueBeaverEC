"use client";

import { createContext, useContext } from "react";
import type { MapaPermissoes, ModuloPermissao, NivelPermissao } from "@aion/shared";
import { temPermissao as tem } from "@aion/shared";

export interface SessionMe {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  estabelecimentoId: string;
  estabelecimentoNome: string;
  estabelecimentos: Array<{ id: string; nome: string; perfil: string }>;
  setorIds?: string[];
  setores?: Array<{ id: string; nome: string }>;
  permissoesModulos?: MapaPermissoes;
  permissoes?: {
    editarCadastros: boolean;
    alterarStatusOS: boolean;
    verValoresFinanceiros: boolean;
  };
}

const SessionContext = createContext<SessionMe | null>(null);

export function SessionProvider({
  value,
  children,
}: {
  value: SessionMe;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function useCan(modulo: ModuloPermissao, minimo: NivelPermissao = 1) {
  const me = useSession();
  return tem(me?.permissoesModulos, modulo, minimo);
}

/** Técnico executa OS; enfermeiro/solicitante só abre pedidos. */
export function useMobilePersona() {
  const me = useSession();
  const canExecutar = tem(me?.permissoesModulos, "os", 2);
  const canSolicitar = tem(me?.permissoesModulos, "portal", 2);
  const canInventario = tem(me?.permissoesModulos, "equipamentos", 1) && canExecutar;
  return {
    me,
    canExecutar,
    canSolicitar,
    canInventario,
    isEnfermeiro: Boolean(canSolicitar && !canExecutar),
    isTecnico: Boolean(canExecutar),
  };
}

export function perfilVaiParaMobile(perfil?: string | null) {
  return (
    perfil === "TECNICO" ||
    perfil === "TECNICO_RESTRITO" ||
    perfil === "SOLICITANTE" ||
    perfil === "ENGENHEIRO" ||
    perfil === "ADMIN"
  );
}

export function preferMobileShell() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem("aion_force_desktop") === "1") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}
