import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";
import { createServer, type Server } from "node:http";
import { AppModule } from "./app.module";

function listenHost() {
  if (process.env.LISTEN_IPV4_ONLY === "1") return "0.0.0.0";
  const raw = process.env.LISTEN_HOST?.trim();
  if (!raw || raw === "0.0.0.0" || raw === "127.0.0.1") return "::";
  return raw;
}

async function listenDualStack(server: Server, port: number, host: string) {
  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("error", onError);
      reject(err);
    };
    server.once("error", onError);
    // ipv6Only:false = aceita AAAA da rede privada e IPv4 do healthcheck Railway.
    server.listen({ port, host, ipv6Only: host === "::" ? false : undefined }, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: "8mb" }));
  app.use(urlencoded({ extended: true, limit: "8mb" }));
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const origin = process.env.CORS_ORIGIN ?? process.env.WEB_ORIGIN ?? "http://localhost:3000";
  app.enableCors({
    origin: origin.split(",").map((o) => o.trim()),
    credentials: true,
  });

  // Railway healthcheck usa PORT; o web interno costuma usar API_PORT=3001.
  // Escutar os dois evita 503 no login quando as portas divergem.
  const ports = [
    ...new Set(
      [process.env.API_PORT, process.env.PORT, "3001"]
        .map((v) => Number(v?.trim() || 0))
        .filter((p) => Number.isInteger(p) && p > 0 && p < 65536),
    ),
  ];
  const host = listenHost();
  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  await listenDualStack(app.getHttpServer() as Server, ports[0], host);
  // eslint-disable-next-line no-console
  console.log(`Aion API listening on ${host}:${ports[0]}`);
  for (const extra of ports.slice(1)) {
    const server = createServer(expressApp);
    await listenDualStack(server, extra, host);
    // eslint-disable-next-line no-console
    console.log(`Aion API also listening on ${host}:${extra}`);
  }
}

void bootstrap().catch((err) => {
  console.error("[aion] bootstrap falhou:", err);
  process.exit(1);
});
