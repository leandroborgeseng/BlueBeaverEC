#!/usr/bin/env node
/**
 * Demo: comportamento do bootstrap de admin/demo sem banco real.
 * Demonstra a lógica de decisão baseada em env vars e estado do usuário.
 * NÃO é destrutivo (não faz DELETE/UPDATE no banco).
 */

console.log("=== DEMO: Comportamento do Bootstrap ===\n");

// Simulando a lógica de decisão do admin-bootstrap.ts
function decideAdminBootstrap(config, userExists) {
  if (!config.email?.trim() || !config.nome?.trim() || !config.password?.trim()) {
    return {
      shouldSkip: true,
      shouldCreate: false,
      shouldUpdateName: false,
      reason: "ADMIN_EMAIL, ADMIN_NOME ou ADMIN_PASSWORD ausente",
    };
  }

  if (!userExists) {
    return {
      shouldSkip: false,
      shouldCreate: true,
      shouldUpdateName: false,
      reason: "criar novo admin",
    };
  }

  return {
    shouldSkip: false,
    shouldCreate: false,
    shouldUpdateName: true,
    reason: "admin já existe, preservar senha",
  };
}

// Simulando a lógica de decisão do demo-bootstrap.ts
function decideDemoBootstrap(config, userExists) {
  if (config.isProduction && !config.seedDemoUsers) {
    return {
      shouldSkip: true,
      shouldCreate: false,
      shouldUpdatePassword: false,
      reason: "produção sem SEED_DEMO_USERS=1",
    };
  }

  if (!config.demoPassword?.trim()) {
    return {
      shouldSkip: true,
      shouldCreate: false,
      shouldUpdatePassword: false,
      reason: "DEMO_PASSWORD ausente",
    };
  }

  if (!userExists) {
    return {
      shouldSkip: false,
      shouldCreate: true,
      shouldUpdatePassword: false,
      reason: "criar nova conta demo",
    };
  }

  return {
    shouldSkip: false,
    shouldCreate: false,
    shouldUpdatePassword: false,
    reason: "conta demo já existe, preservar senha",
  };
}

// Cenário 1: Primeiro boot com env vars
console.log("### Cenário 1: Primeiro boot (banco vazio, env vars definidas)");
console.log("ENV: ADMIN_EMAIL=admin@hef.br, ADMIN_PASSWORD=secret123, DEMO_PASSWORD=demo123");
console.log("");

let adminDecision = decideAdminBootstrap(
  { email: "admin@hef.br", nome: "Admin HEF", password: "secret123" },
  false,
);
console.log("Admin:", adminDecision);
console.log("→ Usuário admin será CRIADO com a senha fornecida");
console.log("");

let demoDecision = decideDemoBootstrap(
  { demoPassword: "demo123", seedDemoUsers: false, isProduction: false },
  false,
);
console.log("Demo (dev):", demoDecision);
console.log("→ Contas demo serão CRIADAS com a senha fornecida");
console.log("");

// Cenário 2: Segundo boot (usuários existem)
console.log("### Cenário 2: Segundo boot (usuários já existem, env vars definidas)");
console.log("ENV: ADMIN_EMAIL=admin@hef.br, ADMIN_PASSWORD=secret123, DEMO_PASSWORD=demo123");
console.log("");

adminDecision = decideAdminBootstrap(
  { email: "admin@hef.br", nome: "Admin HEF", password: "secret123" },
  true,
);
console.log("Admin:", adminDecision);
console.log("→ Usuário admin NÃO terá senha alterada (preservada)");
console.log("");

demoDecision = decideDemoBootstrap(
  { demoPassword: "demo123", seedDemoUsers: false, isProduction: false },
  true,
);
console.log("Demo (dev):", demoDecision);
console.log("→ Contas demo NÃO terão senha alterada (preservadas)");
console.log("");

// Cenário 3: Produção sem flag
console.log("### Cenário 3: Boot em produção sem SEED_DEMO_USERS");
console.log("ENV: NODE_ENV=production, ADMIN_EMAIL=admin@hef.br, DEMO_PASSWORD=demo123");
console.log("     SEED_DEMO_USERS não definida");
console.log("");

adminDecision = decideAdminBootstrap(
  { email: "admin@hef.br", nome: "Admin HEF", password: "secret123" },
  false,
);
console.log("Admin:", adminDecision);
console.log("→ Admin será criado normalmente");
console.log("");

demoDecision = decideDemoBootstrap(
  { demoPassword: "demo123", seedDemoUsers: false, isProduction: true },
  false,
);
console.log("Demo (prod sem flag):", demoDecision);
console.log("→ Contas demo NÃO serão criadas (produção sem SEED_DEMO_USERS=1)");
console.log("");

// Cenário 4: Sem env vars
console.log("### Cenário 4: Boot sem env vars definidas");
console.log("ENV: (vazias)");
console.log("");

adminDecision = decideAdminBootstrap({}, false);
console.log("Admin:", adminDecision);
console.log("→ Bootstrap de admin será IGNORADO (sem crash)");
console.log("");

demoDecision = decideDemoBootstrap(
  { demoPassword: "", seedDemoUsers: false, isProduction: false },
  false,
);
console.log("Demo:", demoDecision);
console.log("→ Bootstrap de demo será IGNORADO (sem crash)");
console.log("");

// Cenário 5: Produção com flag explícita
console.log("### Cenário 5: Produção com SEED_DEMO_USERS=1");
console.log("ENV: NODE_ENV=production, DEMO_PASSWORD=demo123, SEED_DEMO_USERS=1");
console.log("");

demoDecision = decideDemoBootstrap(
  { demoPassword: "demo123", seedDemoUsers: true, isProduction: true },
  false,
);
console.log("Demo (prod com flag):", demoDecision);
console.log("→ Contas demo SERÃO criadas (opt-in explícito)");
console.log("");

console.log("=== Fim da demonstração ===");
