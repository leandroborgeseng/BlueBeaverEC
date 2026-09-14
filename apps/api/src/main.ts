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

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
  // 0.0.0.0 = IPv4 (rede privada nova do Railway). Use LISTEN_HOST=:: só se for legado IPv6.
  // Não ler HOSTNAME (no Railway é o nome do container → conexão recusada).
  const host = process.env.LISTEN_HOST || "0.0.0.0";
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`Aion API listening on ${host}:${port}`);
}

void bootstrap().catch((err) => {
  console.error("[aion] bootstrap falhou:", err);
  process.exit(1);
});
