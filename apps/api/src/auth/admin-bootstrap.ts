/**
 * Lógica de bootstrap do super administrador.
 * Testável e usado por ensure-admin-user.mjs.
 */

export interface AdminBootstrapConfig {
  email?: string;
  nome?: string;
  password?: string;
}

export interface AdminBootstrapDecision {
  shouldSkip: boolean;
  shouldCreate: boolean;
  shouldUpdateName: boolean;
  reason?: string;
}

/**
 * Decide o que fazer no bootstrap do admin baseado nas env vars e estado existente.
 */
export function decideAdminBootstrap(
  config: AdminBootstrapConfig,
  userExists: boolean,
): AdminBootstrapDecision {
  // Se qualquer credencial estiver faltando, skip
  if (!config.email?.trim() || !config.nome?.trim() || !config.password?.trim()) {
    return {
      shouldSkip: true,
      shouldCreate: false,
      shouldUpdateName: false,
      reason: "ADMIN_EMAIL, ADMIN_NOME ou ADMIN_PASSWORD ausente",
    };
  }

  // Se o usuário não existe, criar
  if (!userExists) {
    return {
      shouldSkip: false,
      shouldCreate: true,
      shouldUpdateName: false,
      reason: "criar novo admin",
    };
  }

  // Se o usuário existe, apenas atualizar nome (não senha)
  return {
    shouldSkip: false,
    shouldCreate: false,
    shouldUpdateName: true,
    reason: "admin já existe, preservar senha",
  };
}
