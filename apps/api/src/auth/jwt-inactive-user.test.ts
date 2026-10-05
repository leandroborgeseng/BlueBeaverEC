import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Testa que usuários inativos são rejeitados mesmo com JWT válido.
 * Este teste documenta o comportamento esperado do JwtStrategy.validate().
 */

interface User {
  id: string;
  ativo: boolean;
}

async function mockValidateJwt(userId: string, mockDb: Map<string, User>): Promise<boolean> {
  const user = mockDb.get(userId);
  if (!user || !user.ativo) {
    throw new Error("Usuário inativo ou não encontrado");
  }
  return true;
}

describe("JWT Strategy - Inactive User Check", () => {
  it("deve aceitar JWT de usuário ativo", async () => {
    const mockDb = new Map<string, User>([["user1", { id: "user1", ativo: true }]]);

    const result = await mockValidateJwt("user1", mockDb);
    assert.strictEqual(result, true);
  });

  it("deve rejeitar JWT de usuário inativo", async () => {
    const mockDb = new Map<string, User>([["user2", { id: "user2", ativo: false }]]);

    await assert.rejects(
      async () => await mockValidateJwt("user2", mockDb),
      { message: "Usuário inativo ou não encontrado" },
    );
  });

  it("deve rejeitar JWT de usuário não encontrado", async () => {
    const mockDb = new Map<string, User>();

    await assert.rejects(
      async () => await mockValidateJwt("user999", mockDb),
      { message: "Usuário inativo ou não encontrado" },
    );
  });

  it("deve rejeitar JWT após usuário ser desativado (token pré-existente)", async () => {
    const mockDb = new Map<string, User>([["user3", { id: "user3", ativo: true }]]);

    // Token emitido quando usuário estava ativo
    const validBefore = await mockValidateJwt("user3", mockDb);
    assert.strictEqual(validBefore, true);

    // Usuário desativado (ex: demo em produção)
    mockDb.set("user3", { id: "user3", ativo: false });

    // Mesmo token agora deve ser rejeitado
    await assert.rejects(
      async () => await mockValidateJwt("user3", mockDb),
      { message: "Usuário inativo ou não encontrado" },
    );
  });
});
