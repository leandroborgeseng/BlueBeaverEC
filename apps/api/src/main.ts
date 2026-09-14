import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

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

  // PORT primeiro: contrato Railway (healthcheck + rede privada). API_PORT só se PORT ausente.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  // Não ler HOSTNAME (no Railway é o nome do container → conexão recusada).
  // Rede privada Railway (legado IPv6-only e dual-stack novo) exige `::`.
  // 0.0.0.0 só IPv4: o web alcança *.railway.internal via AAAA e o login vira 502.
  const host = listenHost();
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`Aion API listening on ${host}:${port}`);
}

function listenHost() {
  if (process.env.LISTEN_IPV4_ONLY === "1") return "0.0.0.0";
  const raw = process.env.LISTEN_HOST?.trim();
  if (!raw || raw === "0.0.0.0" || raw === "127.0.0.1") return "::";
  return raw;
}

void bootstrap().catch((err) => {
  console.error("[aion] bootstrap falhou:", err);
  process.exit(1);
});
