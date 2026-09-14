import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json, urlencoded } from "express";
import { createServer, type Server } from "node:http";
import { AppModule } from "./app.module";

function listenPorts(): number[] {
  return [
    ...new Set(
      [process.env.PORT, process.env.API_PORT, "3001"]
        .map((v) => Number(String(v ?? "").trim() || 0))
        .filter((p) => Number.isInteger(p) && p > 0 && p < 65536),
    ),
  ];
}

function listenOn(server: Server, port: number, host: string, ipv6Only?: boolean) {
  return new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off("error", onError);
      reject(err);
    };
    server.once("error", onError);
    server.listen({ port, host, ipv6Only }, () => {
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

  const ports = listenPorts();
  const customHost = process.env.LISTEN_HOST?.trim();
  const ipv4Only = process.env.LISTEN_IPV4_ONLY === "1";
  const ipv6Only = process.env.LISTEN_IPV6_ONLY === "1";
  await app.init();
  const expressApp = app.getHttpAdapter().getInstance();
  const nestServer = app.getHttpServer() as Server;

  for (let i = 0; i < ports.length; i++) {
    const port = ports[i];
    const server = i === 0 ? nestServer : createServer(expressApp);

    if (customHost === "127.0.0.1") {
      await listenOn(server, port, "127.0.0.1");
      // eslint-disable-next-line no-console
      console.log(`Aion API listening on 127.0.0.1:${port}`);
      continue;
    }

    if (customHost && customHost !== "0.0.0.0" && customHost !== "::") {
      await listenOn(server, port, customHost);
      // eslint-disable-next-line no-console
      console.log(`Aion API listening on ${customHost}:${port}`);
      continue;
    }

    if (ipv6Only) {
      await listenOn(server, port, "::", true);
      // eslint-disable-next-line no-console
      console.log(`Aion API listening on [::]:${port}`);
      continue;
    }

    // IPv4 0.0.0.0: healthcheck Railway + proxy em A. IPv6 :: : rede privada AAAA.
    await listenOn(server, port, "0.0.0.0");
    // eslint-disable-next-line no-console
    console.log(`Aion API listening on 0.0.0.0:${port}`);
    if (!ipv4Only) {
      try {
        const v6 = createServer(expressApp);
        await listenOn(v6, port, "::", true);
        // eslint-disable-next-line no-console
        console.log(`Aion API also listening on [::]:${port}`);
      } catch (err) {
        console.warn(
          `[aion] IPv6 :${port} indisponível:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}

void bootstrap().catch((err) => {
  console.error("[aion] bootstrap falhou:", err);
  process.exit(1);
});
