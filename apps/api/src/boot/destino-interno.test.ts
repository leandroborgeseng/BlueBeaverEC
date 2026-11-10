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
    assert.match(route, /API_INTERNAL_URL:\s*process\.env\.API_INTERNAL_URL/);
    assert.match(route, /API_INTERNAL_HOST:\s*process\.env\.API_INTERNAL_HOST/);
    assert.match(route, /API_INTERNAL_PORT:\s*process\.env\.API_INTERNAL_PORT/);
    assert.equal(route.includes("tentativaPrivadaExplicita(pathSuffix, req"), false);
  });
});
