import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Testa a lógica de filtragem de domínios demo para desativação.
 */

function isDemoEmail(email: string): boolean {
  return email.endsWith("@aion.local") || email.endsWith("@nexo.local");
}

describe("Demo Account Deactivation Logic", () => {
  it("deve identificar domínios demo corretamente", () => {
    assert.strictEqual(isDemoEmail("tecnico@aion.local"), true);
    assert.strictEqual(isDemoEmail("engenheiro@aion.local"), true);
    assert.strictEqual(isDemoEmail("test@nexo.local"), true);
  });

  it("NÃO deve marcar domínios reais como demo", () => {
    assert.strictEqual(isDemoEmail("leandro.borges@aion.eng.br"), false);
    assert.strictEqual(isDemoEmail("bsnaldi@hrtc.faepa.br"), false);
    assert.strictEqual(isDemoEmail("rmjuvencio@hrtc.faepa.br"), false);
    assert.strictEqual(isDemoEmail("admin@example.com"), false);
    assert.strictEqual(isDemoEmail("user@company.br"), false);
  });

  it("deve ser case-sensitive no sufixo", () => {
    // SQL LIKE é case-sensitive por padrão no Postgres
    assert.strictEqual(isDemoEmail("test@AION.LOCAL"), false);
    assert.strictEqual(isDemoEmail("test@Aion.Local"), false);
  });

  it("deve rejeitar e-mails que apenas contêm mas não terminam com domínio demo", () => {
    assert.strictEqual(isDemoEmail("@aion.local.fake.com"), false);
    assert.strictEqual(isDemoEmail("test@nexo.local.br"), false);
  });
});
