import { describe, it } from "node:test";
import assert from "node:assert";
import { decideDemoBootstrap } from "./demo-bootstrap.js";

describe("Demo Bootstrap", () => {
  it("deve skipar em produção sem SEED_DEMO_USERS", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "demo123", seedDemoUsers: false, isProduction: true },
      false,
    );
    assert.strictEqual(decision.shouldSkip, true);
    assert.strictEqual(decision.shouldCreate, false);
    assert.ok(decision.reason?.includes("produção"));
  });

  it("deve skipar quando DEMO_PASSWORD está ausente", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "", seedDemoUsers: true, isProduction: false },
      false,
    );
    assert.strictEqual(decision.shouldSkip, true);
    assert.ok(decision.reason?.includes("DEMO_PASSWORD ausente"));
  });

  it("deve criar em produção quando SEED_DEMO_USERS=1 e senha presente", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "demo123", seedDemoUsers: true, isProduction: true },
      false,
    );
    assert.strictEqual(decision.shouldSkip, false);
    assert.strictEqual(decision.shouldCreate, true);
  });

  it("deve criar em não-produção quando senha presente", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "demo123", seedDemoUsers: false, isProduction: false },
      false,
    );
    assert.strictEqual(decision.shouldSkip, false);
    assert.strictEqual(decision.shouldCreate, true);
  });

  it("não deve atualizar senha quando usuário já existe", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "demo123", seedDemoUsers: true, isProduction: false },
      true,
    );
    assert.strictEqual(decision.shouldSkip, false);
    assert.strictEqual(decision.shouldCreate, false);
    assert.strictEqual(decision.shouldUpdatePassword, false);
    assert.ok(decision.reason?.includes("preservar senha"));
  });

  it("deve trimmar DEMO_PASSWORD", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "   demo123   ", seedDemoUsers: false, isProduction: false },
      false,
    );
    assert.strictEqual(decision.shouldSkip, false);
    assert.strictEqual(decision.shouldCreate, true);
  });

  it("deve skipar quando DEMO_PASSWORD tem apenas espaços", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "   ", seedDemoUsers: false, isProduction: false },
      false,
    );
    assert.strictEqual(decision.shouldSkip, true);
  });

  it("deve criar em produção com SEED_DEMO_USERS=1 mesmo que usuário não exista", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "demo123", seedDemoUsers: true, isProduction: true },
      false,
    );
    assert.strictEqual(decision.shouldSkip, false);
    assert.strictEqual(decision.shouldCreate, true);
  });

  it("deve skipar em produção sem flag mesmo com senha e usuário ausente", () => {
    const decision = decideDemoBootstrap(
      { demoPassword: "demo123", seedDemoUsers: false, isProduction: true },
      false,
    );
    assert.strictEqual(decision.shouldSkip, true);
  });
});
