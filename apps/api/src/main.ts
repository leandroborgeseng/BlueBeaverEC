import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
  // `::` = dual-stack (IPv4+IPv6). Necessário para railway.internal (IPv6).
  const host = process.env.HOST ?? "::";
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`Nexo API listening on [${host}]:${port}`);
}

void bootstrap();
