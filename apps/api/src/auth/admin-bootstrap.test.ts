import { describe, it } from "node:test";
import assert from "node:assert";
import { decideAdminBootstrap } from "./admin-bootstrap.js";

describe("Admin Bootstrap", () => {
  it("deve skipar quando ADMIN_EMAIL está ausente", () => {
    const decision = decideAdminBootstrap(
      { email: "", nome: "Admin", password: "senha123" },
      false,
    );
    assert.strictEqual(decision.shouldSkip, true);
    assert.strictEqual(decision.shouldCreate, false);
    assert.ok(decision.reason?.includes("ausente"));
  });

  it("deve skipar quando ADMIN_NOME está ausente", () => {
    const decision = decideAdminBootstrap(
      { email: "admin@example.com", nome: "", password: "senha123" },
      false,
    );
    assert.strictEqual(decision.shouldSkip, true);
    assert.strictEqual(decision.shouldCreate, false);
  });

  it("deve skipar quando ADMIN_PASSWORD está ausente", () => {
    const decision = decideAdminBootstrap(
      { email: "admin@example.com", nome: "Admin", password: "" },
      false,
    );
    assert.strictEqual(decision.shouldSkip, true);
    assert.strictEqual(decision.shouldCreate, false);
  });

  it("deve skipar quando todas as credenciais estão ausentes", () => {
    const decision = decideAdminBootstrap({}, false);
    assert.strictEqual(decision.shouldSkip, true);
    assert.strictEqual(decision.shouldCreate, false);
  });

  it("deve criar quando credenciais estão presentes e usuário não existe", () => {
    const decision = decideAdminBootstrap(
      { email: "admin@example.com", nome: "Admin", password: "senha123" },
      false,
    );
    assert.strictEqual(decision.shouldSkip, false);
    assert.strictEqual(decision.shouldCreate, true);
    assert.strictEqual(decision.shouldUpdateName, false);
  });

  it("deve skipar completamente quando usuário já existe (usuário real preservado)", () => {
    const decision = decideAdminBootstrap(
      { email: "admin@example.com", nome: "Admin", password: "senha123" },
      true,
    );
    assert.strictEqual(decision.shouldSkip, true);
    assert.strictEqual(decision.shouldCreate, false);
    assert.strictEqual(decision.shouldUpdateName, false);
    assert.ok(decision.reason?.includes("usuário real preservado"));
  });

  it("deve trimmar espaços em branco nas credenciais", () => {
    const decision = decideAdminBootstrap(
      { email: "  admin@example.com  ", nome: "  Admin  ", password: "  senha123  " },
      false,
    );
    assert.strictEqual(decision.shouldSkip, false);
    assert.strictEqual(decision.shouldCreate, true);
  });

  it("deve skipar quando email tem apenas espaços", () => {
    const decision = decideAdminBootstrap(
      { email: "   ", nome: "Admin", password: "senha123" },
      false,
    );
    assert.strictEqual(decision.shouldSkip, true);
  });
});
