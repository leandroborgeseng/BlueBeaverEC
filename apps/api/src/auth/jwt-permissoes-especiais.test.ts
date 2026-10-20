/** E2/Q1 — JWT carrega permissões especiais do vínculo; personificação não herda. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JwtStrategy } from "./jwt.strategy";

const prisma = (permissoesEspeciais: unknown) => ({
  usuario: { findUnique: async () => ({ ativo: true }) },
  perfilCustom: { findFirst: async () => null },
  usuarioEstabelecimento: { findUnique: async () => ({ permissoesEspeciais }) },
});
process.env.JWT_SECRET = "test-secret";
const payload = { sub: "u1", email: "t@aion.local", estabelecimentoId: "e1", perfil: "TECNICO" } as any;

describe("JWT — permissões especiais (E2/Q1)", () => {
  it("carrega só chaves conhecidas", async () => {
    const r = await new JwtStrategy(prisma(["procedimento.publicar", "inventada"]) as any).validate(payload);
    assert.deepEqual(r.permissoesEspeciais, ["procedimento.publicar"]);
  });
  it("nenhum perfil tem por padrão (ADMIN sem atribuição = vazio)", async () => {
    const r = await new JwtStrategy(prisma(null) as any).validate({ ...payload, perfil: "ADMIN" });
    assert.deepEqual(r.permissoesEspeciais, []);
  });
  it("personificação não herda a permissão", async () => {
    const r = await new JwtStrategy(prisma(["procedimento.publicar"]) as any).validate({ ...payload, impersonatorId: "adm" });
    assert.deepEqual(r.permissoesEspeciais, []);
  });
});
