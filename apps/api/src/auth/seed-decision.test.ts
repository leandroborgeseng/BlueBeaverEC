import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Testa a lógica de decisão do seed.ts sobre criar admin e demos.
 */

interface SeedConfig {
  isProduction: boolean;
  seedDemoUsers: boolean;
  demoPassword?: string;
  adminEmail?: string;
  adminNome?: string;
  adminPassword?: string;
}

function decideSeedBehavior(config: SeedConfig) {
  const shouldSeedDemos = (!config.isProduction || config.seedDemoUsers) && !!config.demoPassword;
  const shouldSeedAdmin = !!(config.adminEmail && config.adminNome && config.adminPassword);

  return {
    shouldSeedDemos,
    shouldSeedAdmin,
    demoReason: !shouldSeedDemos
      ? config.isProduction && !config.seedDemoUsers
        ? "produção sem SEED_DEMO_USERS=1"
        : "DEMO_PASSWORD ausente"
      : "ok",
    adminReason: !shouldSeedAdmin ? "ADMIN_EMAIL, ADMIN_NOME ou ADMIN_PASSWORD ausente" : "ok",
  };
}

describe("Seed Decision Logic", () => {
  it("produção sem env vars: NÃO cria admin, NÃO cria demos", () => {
    const decision = decideSeedBehavior({
      isProduction: true,
      seedDemoUsers: false,
    });
    assert.strictEqual(decision.shouldSeedDemos, false);
    assert.strictEqual(decision.shouldSeedAdmin, false);
    assert.strictEqual(decision.demoReason, "produção sem SEED_DEMO_USERS=1");
    assert.strictEqual(decision.adminReason, "ADMIN_EMAIL, ADMIN_NOME ou ADMIN_PASSWORD ausente");
  });

  it("produção sem ADMIN_*: NÃO cria admin", () => {
    const decision = decideSeedBehavior({
      isProduction: true,
      seedDemoUsers: true,
      demoPassword: "demo123",
    });
    assert.strictEqual(decision.shouldSeedDemos, true);
    assert.strictEqual(decision.shouldSeedAdmin, false);
    assert.strictEqual(decision.adminReason, "ADMIN_EMAIL, ADMIN_NOME ou ADMIN_PASSWORD ausente");
  });

  it("produção com todas as env vars de admin: cria admin", () => {
    const decision = decideSeedBehavior({
      isProduction: true,
      seedDemoUsers: false,
      adminEmail: "admin@example.com",
      adminNome: "Admin",
      adminPassword: "admin123",
    });
    assert.strictEqual(decision.shouldSeedAdmin, true);
    assert.strictEqual(decision.adminReason, "ok");
  });

  it("dev sem DEMO_PASSWORD: NÃO cria demos", () => {
    const decision = decideSeedBehavior({
      isProduction: false,
      seedDemoUsers: false,
    });
    assert.strictEqual(decision.shouldSeedDemos, false);
    assert.strictEqual(decision.demoReason, "DEMO_PASSWORD ausente");
  });

  it("dev com DEMO_PASSWORD: cria demos", () => {
    const decision = decideSeedBehavior({
      isProduction: false,
      seedDemoUsers: false,
      demoPassword: "demo123",
    });
    assert.strictEqual(decision.shouldSeedDemos, true);
    assert.strictEqual(decision.demoReason, "ok");
  });

  it("produção com SEED_DEMO_USERS=1 e DEMO_PASSWORD: cria demos", () => {
    const decision = decideSeedBehavior({
      isProduction: true,
      seedDemoUsers: true,
      demoPassword: "demo123",
    });
    assert.strictEqual(decision.shouldSeedDemos, true);
    assert.strictEqual(decision.demoReason, "ok");
  });

  it("ADMIN_EMAIL presente mas ADMIN_NOME ou ADMIN_PASSWORD ausente: NÃO cria admin", () => {
    const decision1 = decideSeedBehavior({
      isProduction: false,
      seedDemoUsers: false,
      adminEmail: "admin@example.com",
      adminNome: "Admin",
      // adminPassword ausente
    });
    assert.strictEqual(decision1.shouldSeedAdmin, false);

    const decision2 = decideSeedBehavior({
      isProduction: false,
      seedDemoUsers: false,
      adminEmail: "admin@example.com",
      // adminNome ausente
      adminPassword: "admin123",
    });
    assert.strictEqual(decision2.shouldSeedAdmin, false);
  });
});
