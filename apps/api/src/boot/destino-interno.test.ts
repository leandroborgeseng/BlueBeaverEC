import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  aceitaDestinoExplicito,
  destinoExplicito,
  isPrivateRailwayHost,
  isPublicApiUrl,
  isSelfWebHost,
  planejarAtalhoPrivado,
  tentativaPrivadaExplicita,
  urlPrivadaExplicita,
} from "../../../web/src/lib/destino-interno";

const COOLIFY = { API_INTERNAL_URL: "http://bbec-api:8080" };

describe("proxy — destino explícito", () => {
  it("aceita só o host:porta exatos de API_INTERNAL_URL", () => {
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", COOLIFY), true);
    assert.equal(aceitaDestinoExplicito("BBEC-API", "8080", COOLIFY), true);
    assert.equal(urlPrivadaExplicita(COOLIFY), "http://bbec-api:8080");
    assert.deepEqual(tentativaPrivadaExplicita("/api/health", COOLIFY), {
      url: "http://bbec-api:8080/api/health",
      host: "bbec-api",
      port: "8080",
    });
  });

  it("aceita API_INTERNAL_HOST + API_INTERNAL_PORT quando a URL não vem", () => {
    const env = { API_INTERNAL_HOST: "bbec-api", API_INTERNAL_PORT: "8080" };
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", env), true);
    assert.equal(aceitaDestinoExplicito("bbec-api", "3001", env), false);
    assert.equal(urlPrivadaExplicita(env), "http://bbec-api:8080");
    assert.equal(destinoExplicito({ API_INTERNAL_HOST: "bbec-api" }), null);
  });

  it("a URL explícita vence o par host/porta", () => {
    assert.equal(
      urlPrivadaExplicita({
        API_INTERNAL_URL: "http://bbec-api:8080",
        API_INTERNAL_HOST: "outro-host",
        API_INTERNAL_PORT: "9",
      }),
      "http://bbec-api:8080",
    );
    assert.equal(aceitaDestinoExplicito("outro-host", "9", COOLIFY), false);
  });

  it("recusa sufixo, prefixo, outra porta, IP, localhost, metadata e env vazia", () => {
    assert.equal(aceitaDestinoExplicito("bbec-api.evil", "8080", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("evil-bbec-api", "8080", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("bbec-api", "8081", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("bbec-api", "80", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("1.2.3.4", "8080", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("10.0.0.5", "8080", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("[::1]", "8080", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("localhost", "8080", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("127.0.0.1", "8080", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("169.254.169.254", "80", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("169.254.169.254", "8080", COOLIFY), false);
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", {}), false);
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", { API_INTERNAL_URL: "  " }), false);
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", { API_INTERNAL_HOST: "", API_INTERNAL_PORT: "" }), false);
    assert.equal(urlPrivadaExplicita({}), null);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "" }), null);
  });

  it("não promove IP literal, localhost nem metadata mesmo se estiverem no env", () => {
    assert.equal(
      aceitaDestinoExplicito("169.254.169.254", "80", { API_INTERNAL_URL: "http://169.254.169.254" }),
      false,
    );
    assert.equal(
      aceitaDestinoExplicito("10.1.2.3", "8080", { API_INTERNAL_URL: "http://10.1.2.3:8080" }),
      false,
    );
    assert.equal(
      aceitaDestinoExplicito("localhost", "8080", { API_INTERNAL_URL: "http://localhost:8080" }),
      false,
    );
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://169.254.169.254" }), null);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://10.1.2.3:8080" }), null);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://localhost:8080" }), null);
    assert.equal(
      aceitaDestinoExplicito("bbec-api", "8080", { API_INTERNAL_URL: "http://bbec-api.evil:8080" }),
      false,
    );
    assert.equal(
      aceitaDestinoExplicito("bbec-api", "8080", { API_INTERNAL_URL: "http://evil-bbec-api:8080" }),
      false,
    );
  });

  it("path e query não trocam o host de destino", () => {
    const tentativa = tentativaPrivadaExplicita(
      "/api/health?host=evil.com&x-forwarded-host=169.254.169.254",
      COOLIFY,
    );
    assert.ok(tentativa);
    const url = new URL(tentativa.url);
    assert.equal(url.hostname, "bbec-api");
    assert.equal(url.port, "8080");
    assert.equal(tentativa.host, "bbec-api");
  });
});

describe("proxy — regressão Railway sem destino explícito Coolify", () => {
  it("mantém *.railway.internal e *.railway.app quando a env explícita não existe", () => {
    assert.equal(isPrivateRailwayHost("nexo-api.railway.internal"), true);
    assert.equal(isPrivateRailwayHost("aion-api.railway.internal"), true);
    assert.equal(isPrivateRailwayHost("api.railway.internal"), true);
    assert.equal(isPrivateRailwayHost("bbec-api"), false);
    assert.equal(isPrivateRailwayHost("bbec-api.evil"), false);
    assert.equal(isPrivateRailwayHost("evil-bbec-api"), false);
    assert.equal(isPrivateRailwayHost("notrailway.internal"), false);
    assert.equal(isPrivateRailwayHost("evil.railway.internal.example"), false);

    assert.equal(isPublicApiUrl(new URL("https://api.up.railway.app")), true);
    assert.equal(isPublicApiUrl(new URL("http://api.up.railway.app")), true);
    assert.equal(isPublicApiUrl(new URL("http://api.railway.app")), true);
    assert.equal(isPublicApiUrl(new URL("https://api.up.railway.app/health")), true);
    assert.equal(isPublicApiUrl(new URL("http://bbec-api:8080")), false);
    assert.equal(isPublicApiUrl(new URL("http://nexo-api.railway.internal:3001")), false);
    assert.equal(isPublicApiUrl(new URL("https://hef.aion.eng.br")), false);
    assert.equal(isSelfWebHost("hef.aion.eng.br"), true);

    assert.equal(urlPrivadaExplicita({}), null);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_HOST: "nexo-api.railway.internal" }), null);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://nexo-api.railway.internal:3001" }), null);
    assert.equal(
      urlPrivadaExplicita({ API_INTERNAL_HOST: "nexo-api.railway.internal", API_INTERNAL_PORT: "3001" }),
      null,
    );
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "https://api.up.railway.app" }), null);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://api.up.railway.app" }), null);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://api.railway.app:3001" }), null);
    assert.equal(tentativaPrivadaExplicita("/api/health", {}), null);
  });

  it("o route não deixa header da requisição escolher o destino", () => {
    const semComentario = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const route = semComentario(
      readFileSync(resolve(__dirname, "../../../web/src/app/api/[...path]/route.ts"), "utf8"),
    );
    const helper = semComentario(
      readFileSync(resolve(__dirname, "../../../web/src/lib/destino-interno.ts"), "utf8"),
    );
    assert.equal(route.toLowerCase().includes("x-forwarded-host"), false);
    assert.equal(helper.toLowerCase().includes("x-forwarded-host"), false);
    assert.equal(helper.includes("req.headers"), false);
    assert.equal(helper.includes("req."), false);
    const recusa = route.indexOf('plano.acao === "recusada"');
    const dns = route.indexOf("dns6Report(");
    const fetchUpstream = route.indexOf("undiciFetch(");
    assert.ok(recusa > 0);
    assert.ok(recusa < dns);
    assert.ok(recusa < fetchUpstream);
    assert.match(route, /API_INTERNAL_URL:\s*process\.env\.API_INTERNAL_URL/);
    assert.match(route, /API_INTERNAL_HOST:\s*process\.env\.API_INTERNAL_HOST/);
    assert.match(route, /API_INTERNAL_PORT:\s*process\.env\.API_INTERNAL_PORT/);
    assert.equal(route.includes("tentativaPrivadaExplicita(pathSuffix, req"), false);
  });
});

describe("QA ciclo 1 — atalho recusado, ponto final, userinfo e https", () => {
  it("M1: API_INTERNAL_HOST metadata responde 502 sem fetch e sem candidatos", () => {
    const env = { API_INTERNAL_HOST: "169.254.169.254", API_INTERNAL_PORT: "80" };
    assert.equal(tentativaPrivadaExplicita("/api/health", env), null);
    let fetches = 0;
    const buscarCandidato = () => {
      fetches += 1;
    };
    const plano = planejarAtalhoPrivado(env, "/api/health");
    if (plano.acao !== "recusada") buscarCandidato();
    assert.equal(plano.acao, "recusada");
    assert.equal(plano.status, 502);
    assert.deepEqual(plano.tentativas, []);
    assert.equal(fetches, 0);
    const serial = JSON.stringify(plano);
    assert.equal(serial.includes("169.254.169.254"), false);
    assert.equal(serial.includes("127.0.0.1"), false);
    assert.equal(serial.includes(":3001"), false);
    assert.equal(serial.includes(":8080"), false);
    assert.equal(serial.includes(":3000"), false);
  });

  it("M1: localhost, IP e userinfo também são 502; Railway e env vazia seguem o legado", () => {
    for (const env of [
      { API_INTERNAL_URL: "http://localhost:3001" },
      { API_INTERNAL_URL: "http://10.1.2.3:8080" },
      { API_INTERNAL_URL: "http://bbec-api:3001@evil:80" },
      { API_INTERNAL_URL: "http://localhost.:3001" },
    ]) {
      const plano = planejarAtalhoPrivado(env, "/api/health");
      assert.equal(plano.acao, "recusada");
      if (plano.acao === "recusada") {
        assert.equal(plano.status, 502);
        assert.equal(plano.tentativas.length, 0);
      }
    }
    assert.equal(planejarAtalhoPrivado({}, "/api/health").acao, "legado");
    assert.equal(
      planejarAtalhoPrivado({ API_INTERNAL_URL: "http://nexo-api.railway.internal:3001" }, "/api/health").acao,
      "legado",
    );
    assert.equal(
      planejarAtalhoPrivado(
        { API_INTERNAL_HOST: "nexo-api.railway.internal", API_INTERNAL_PORT: "3001" },
        "/api/health",
      ).acao,
      "legado",
    );
    assert.equal(planejarAtalhoPrivado({ API_INTERNAL_URL: "https://api.up.railway.app" }, "/api/health").acao, "legado");
  });

  it("B1: ponto final não fura localhost e não muda o host esperado", () => {
    const localhost = { API_INTERNAL_URL: "http://localhost.:3001" };
    assert.equal(aceitaDestinoExplicito("localhost.", "3001", localhost), false);
    assert.equal(aceitaDestinoExplicito("localhost", "3001", localhost), false);
    assert.equal(urlPrivadaExplicita(localhost), null);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://localhost..:3001" }), null);

    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://bbec-api.:8080" }), "http://bbec-api:8080");
    assert.equal(aceitaDestinoExplicito("bbec-api.", "8080", COOLIFY), true);
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", { API_INTERNAL_URL: "http://bbec-api.:8080" }), true);
  });

  it("B2: userinfo não vira o host da URL", () => {
    const env = { API_INTERNAL_URL: "http://bbec-api:3001@evil:80" };
    assert.equal(urlPrivadaExplicita(env), null);
    assert.equal(aceitaDestinoExplicito("evil", "80", env), false);
    assert.equal(aceitaDestinoExplicito("bbec-api", "3001", env), false);
    assert.equal(destinoExplicito(env), null);
    const plano = planejarAtalhoPrivado(env, "/api/health");
    assert.equal(plano.acao, "recusada");
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "http://user:pass@bbec-api:8080" }), null);
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", { API_INTERNAL_URL: "http://user:pass@bbec-api:8080" }), false);
  });

  it("B4: ftp, file e gopher respondem 502; https continua no legado", () => {
    for (const url of ["ftp://bbec-api:21", "file:///etc/passwd", "gopher://bbec-api:70", "FTP://bbec-api:21"]) {
      const env = { API_INTERNAL_URL: url };
      const plano = planejarAtalhoPrivado(env, "/api/health");
      assert.equal(plano.acao, "recusada", url);
      if (plano.acao === "recusada") {
        assert.equal(plano.status, 502);
        assert.deepEqual(plano.tentativas, []);
      }
      assert.equal(urlPrivadaExplicita(env), null);
      assert.equal(destinoExplicito(env), null);
      assert.equal(aceitaDestinoExplicito("ftp", "80", env), false);
      assert.equal(aceitaDestinoExplicito("bbec-api", "21", env), false);
    }
    let fetches = 0;
    const planoFtp = planejarAtalhoPrivado({ API_INTERNAL_URL: "ftp://bbec-api:21" }, "/api/health");
    if (planoFtp.acao !== "recusada") fetches += 1;
    assert.equal(fetches, 0);
    assert.equal(JSON.stringify(planoFtp).includes("127.0.0.1"), false);

    for (const url of ["https://bbec-api", "https://x.up.railway.app"]) {
      const env = { API_INTERNAL_URL: url };
      assert.equal(planejarAtalhoPrivado(env, "/api/health").acao, "legado");
      assert.equal(urlPrivadaExplicita(env), null);
      assert.equal(tentativaPrivadaExplicita("/api/health", env), null);
      assert.equal(isPublicApiUrl(new URL(url)), true);
    }
  });

  it("A1a: API_INTERNAL_URL=nexo-api.railway.internal:3001 cai no legado", () => {
    const env = { API_INTERNAL_URL: "nexo-api.railway.internal:3001" };
    assert.equal(planejarAtalhoPrivado(env, "/api/health").acao, "legado");
    assert.equal(urlPrivadaExplicita(env), null);
    assert.equal(tentativaPrivadaExplicita("/api/health", env), null);
  });

  it("A1b: API_INTERNAL_HOST=nexo-api.railway.internal:3001 cai no legado", () => {
    const env = { API_INTERNAL_HOST: "nexo-api.railway.internal:3001" };
    assert.equal(planejarAtalhoPrivado(env, "/api/health").acao, "legado");
    assert.equal(urlPrivadaExplicita(env), null);
    assert.equal(tentativaPrivadaExplicita("/api/health", env), null);
  });

  it("A1c: API_INTERNAL_URL=bbec-api:3001 aceita o destino exato via http", () => {
    const env = { API_INTERNAL_URL: "bbec-api:3001" };
    assert.equal(urlPrivadaExplicita(env), "http://bbec-api:3001");
    assert.equal(aceitaDestinoExplicito("bbec-api", "3001", env), true);
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", env), false);
    assert.deepEqual(tentativaPrivadaExplicita("/api/health", env), {
      url: "http://bbec-api:3001/api/health",
      host: "bbec-api",
      port: "3001",
    });
  });

  it("A1d: API_INTERNAL_HOST=bbec-api:3001 aceita o destino exato via http", () => {
    const env = { API_INTERNAL_HOST: "bbec-api:3001" };
    assert.equal(urlPrivadaExplicita(env), "http://bbec-api:3001");
    assert.equal(aceitaDestinoExplicito("bbec-api", "3001", env), true);
    assert.equal(aceitaDestinoExplicito("bbec-api", "8080", env), false);
    assert.equal(planejarAtalhoPrivado(env, "/api/health").acao, "explicita");
  });

  it("B5: porta inválida no host explícito responde 502 sem candidatos", () => {
    for (const port of ["abc", "0", "65536", "99999", "-1", "8080abc"]) {
      const env = { API_INTERNAL_HOST: "bbec-api", API_INTERNAL_PORT: port };
      const plano = planejarAtalhoPrivado(env, "/api/health");
      assert.equal(plano.acao, "recusada", port);
      if (plano.acao === "recusada") {
        assert.equal(plano.status, 502);
        assert.deepEqual(plano.tentativas, []);
      }
      assert.equal(urlPrivadaExplicita(env), null);
      assert.equal(JSON.stringify(plano).includes("127.0.0.1"), false);
    }
    assert.equal(planejarAtalhoPrivado({ API_INTERNAL_HOST: "bbec-api" }, "/api/health").acao, "legado");
    assert.equal(
      planejarAtalhoPrivado({ API_INTERNAL_HOST: "bbec-api", API_INTERNAL_PORT: "8080" }, "/api/health").acao,
      "explicita",
    );
  });

  it("B3: https não entra no atalho privado e não vira http:443", () => {
    const env = { API_INTERNAL_URL: "https://bbec-api" };
    assert.equal(urlPrivadaExplicita(env), null);
    assert.equal(tentativaPrivadaExplicita("/api/health", env), null);
    assert.equal(destinoExplicito(env), null);
    assert.notEqual(urlPrivadaExplicita(env), "http://bbec-api:443");
    assert.equal(planejarAtalhoPrivado(env, "/api/health").acao, "legado");
    assert.equal(isPublicApiUrl(new URL("https://bbec-api")), true);
    assert.equal(urlPrivadaExplicita({ API_INTERNAL_URL: "https://bbec-api:8443" }), null);
  });
});
