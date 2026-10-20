/**
 * QA E1 F1 — datas só-data (emissão/validade/execução) gravadas à meia-noite UTC não podem aparecer
 * um dia antes quando o processo roda em America/Sao_Paulo. Formatador + PDF real em TZ=UTC e TZ=America/Sao_Paulo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { formatarDataCivil } from "@aion/shared";

const TZS = ["UTC", "America/Sao_Paulo"];
const temPdftotext = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();

function emTZ(tz: string, codigo: string): string {
  return execFileSync(process.execPath, [...process.execArgv, "-e", codigo], { env: { ...process.env, TZ: tz }, encoding: "utf8", cwd: __dirname });
}

describe("F1 — formatarDataCivil", () => {
  it("valores diretos (processo atual)", () => {
    assert.equal(formatarDataCivil(new Date("2027-03-01T00:00:00.000Z")), "01/03/2027");
    assert.equal(formatarDataCivil("2027-03-01"), "01/03/2027");
    assert.equal(formatarDataCivil("2027-03-01T00:00:00.000Z"), "01/03/2027");
    // instante com hora → dia civil em SP: 01/03 01:30Z = 28/02 22:30 BRT
    assert.equal(formatarDataCivil("2027-03-01T01:30:00.000Z"), "28/02/2027");
    assert.equal(formatarDataCivil(null), "—");
    assert.equal(formatarDataCivil(undefined, ""), "");
    assert.equal(formatarDataCivil("lixo"), "—");
  });
  for (const tz of TZS) {
    it(`mesmo resultado com TZ=${tz} (inclusive o formato antigo erraria em SP)`, () => {
      const out = emTZ(tz, `const { formatarDataCivil } = require("@aion/shared");
        const d = new Date("2027-03-01T00:00:00.000Z");
        process.stdout.write(JSON.stringify([formatarDataCivil(d), d.toLocaleDateString("pt-BR")]));`);
      const [novo, antigo] = JSON.parse(out);
      assert.equal(novo, "01/03/2027");
      if (tz === "America/Sao_Paulo") assert.equal(antigo, "28/02/2027", "sanidade: o bug reproduz sem o formatador");
    });
  }
});

describe("F1 — PDF real mostra 01/03/2027", () => {
  for (const tz of TZS) {
    it(`TZ=${tz}`, { skip: !temPdftotext && "pdftotext ausente" }, () => {
      const txt = execFileSync(process.execPath, [...process.execArgv, join(__dirname, "data-civil-exibicao.fixture.ts")], {
        env: { ...process.env, TZ: tz }, encoding: "utf8",
      });
      assert.match(txt, /validade 01\/03\/2027/);
      assert.match(txt, /01\/03\/2027/);
      assert.ok(!/28\/02\/2027/.test(txt), txt);
    });
  }
});
