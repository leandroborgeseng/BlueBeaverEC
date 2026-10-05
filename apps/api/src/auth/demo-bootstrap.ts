/**
 * Lógica de bootstrap das contas demo.
 * Testável e usada por ensure-demo-users.mjs.
 */

export interface DemoBootstrapConfig {
  demoPassword?: string;
  seedDemoUsers?: boolean;
  isProduction?: boolean;
}

export interface DemoBootstrapDecision {
  shouldSkip: boolean;
  shouldCreate: boolean;
  shouldUpdatePassword: boolean;
  reason?: string;
}

/**
 * Decide o que fazer no bootstrap de contas demo baseado nas env vars.
 */
export function decideDemoBootstrap(
  config: DemoBootstrapConfig,
  userExists: boolean,
): DemoBootstrapDecision {
  // Em produção, só cria se SEED_DEMO_USERS=1
  if (config.isProduction && !config.seedDemoUsers) {
    return {
      shouldSkip: true,
      shouldCreate: false,
      shouldUpdatePassword: false,
      reason: "produção sem SEED_DEMO_USERS=1",
    };
  }

  // Se DEMO_PASSWORD está ausente, skip
  if (!config.demoPassword?.trim()) {
    return {
      shouldSkip: true,
      shouldCreate: false,
      shouldUpdatePassword: false,
      reason: "DEMO_PASSWORD ausente",
    };
  }

  // Se o usuário não existe, criar
  if (!userExists) {
    return {
      shouldSkip: false,
      shouldCreate: true,
      shouldUpdatePassword: false,
      reason: "criar nova conta demo",
    };
  }

  // Se o usuário existe, apenas atualizar nome (não senha)
  return {
    shouldSkip: false,
    shouldCreate: false,
    shouldUpdatePassword: false,
    reason: "conta demo já existe, preservar senha",
  };
}
