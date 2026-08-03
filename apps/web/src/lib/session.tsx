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
