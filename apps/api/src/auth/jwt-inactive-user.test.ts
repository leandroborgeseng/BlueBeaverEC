import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";
import type { AuthTokenPayload } from "./auth.service";

/**
 * Testa que usuários inativos são rejeitados mesmo com JWT válido.
 * Instancia JwtStrategy real com prisma stub.
 */

interface User {
  id: string;
  ativo: boolean;
}

class PrismaMock {
  private users: Map<string, User>;
  public perfilCustom = { findFirst: async () => null };

  constructor(users: Map<string, User>) {
    this.users = users;
  }

  public usuario = {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const user = this.users.get(where.id);
      return user ? { ativo: user.ativo } : null;
    },
  };
}

function createStrategy(users: Map<string, User>): JwtStrategy {
  const prisma = new PrismaMock(users);
  process.env.JWT_SECRET = "test-secret";
  const strategy = new JwtStrategy(prisma as any);
  return strategy;
}

const mockPayload: AuthTokenPayload = {
  sub: "user1",
  email: "test@example.com",
  estabelecimentoId: "estab1",
  perfil: "ENGENHEIRO",
};

describe("JWT Strategy - Inactive User Check (Real)", () => {
  it("deve aceitar JWT de usuário ativo", async () => {
    const users = new Map<string, User>([["user1", { id: "user1", ativo: true }]]);
    const strategy = createStrategy(users);

    const result = await strategy.validate(mockPayload);
    assert.strictEqual(result.userId, "user1");
    assert.strictEqual(result.email, "test@example.com");
  });

  it("deve rejeitar JWT de usuário inativo com UnauthorizedException", async () => {
    const users = new Map<string, User>([["user1", { id: "user1", ativo: false }]]);
    const strategy = createStrategy(users);

    await assert.rejects(async () => await strategy.validate(mockPayload), {
      name: "UnauthorizedException",
      message: "Usuário inativo ou não encontrado",
    });
  });

  it("deve rejeitar JWT de usuário não encontrado com UnauthorizedException", async () => {
    const users = new Map<string, User>();
    const strategy = createStrategy(users);

    await assert.rejects(async () => await strategy.validate(mockPayload), {
      name: "UnauthorizedException",
      message: "Usuário inativo ou não encontrado",
    });
  });

  it("deve rejeitar JWT após usuário ser desativado (token pré-existente)", async () => {
    const users = new Map<string, User>([["user1", { id: "user1", ativo: true }]]);
    const strategy = createStrategy(users);

    // Token emitido quando usuário estava ativo
    const validBefore = await strategy.validate(mockPayload);
    assert.strictEqual(validBefore.userId, "user1");

    // Usuário desativado (ex: demo em produção)
    users.set("user1", { id: "user1", ativo: false });

    // Mesmo token agora deve ser rejeitado com 401
    await assert.rejects(async () => await strategy.validate(mockPayload), {
      name: "UnauthorizedException",
      message: "Usuário inativo ou não encontrado",
    });
  });
});
