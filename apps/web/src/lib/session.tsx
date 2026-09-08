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
  podePersonificar?: boolean;
  impersonadoPor?: { id: string; nome: string; perfil: string } | null;
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

const FORCE_DESKTOP_KEY = "aion_force_desktop";

export function preferMobileShell() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(FORCE_DESKTOP_KEY) === "1") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

export function labelPerfil(perfil?: string | null) {
  const map: Record<string, string> = {
    ADMIN: "Administrador",
    GESTOR: "Gestor",
    ENGENHEIRO: "Engenheiro",
    TECNICO: "Técnico",
    TECNICO_RESTRITO: "Técnico de campo",
    SOLICITANTE: "Usuário final",
    AUDITORIA: "Auditoria",
  };
  return map[perfil ?? ""] ?? perfil ?? "Perfil";
}

export function destinoDesktop(perfil?: string | null) {
  if (perfil === "SOLICITANTE") return "/portal/abrir-solicitacao";
  if (perfil === "TECNICO" || perfil === "TECNICO_RESTRITO") return "/os";
  return "/dashboard";
}

export function destinoAposSessao(perfil?: string | null) {
  if (preferMobileShell() && perfilVaiParaMobile(perfil)) return "/mobile";
  return destinoDesktop(perfil);
}

export function irParaDesktop(perfil?: string | null) {
  window.localStorage.setItem(FORCE_DESKTOP_KEY, "1");
  window.location.href = destinoDesktop(perfil);
}

export function irParaMobile() {
  window.localStorage.removeItem(FORCE_DESKTOP_KEY);
  window.location.href = "/mobile";
}
