import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { IncomingMessage, ServerResponse } from 'node:http';

let cachedApp: INestApplication | undefined;

async function createApp(): Promise<INestApplication> {
  if (cachedApp) return cachedApp;

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(PinoLogger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ─── Swagger ───────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Foody API')
    .setDescription('API for food inventory and monthly payment management')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.init();
  cachedApp = app;
  return app;
}

// ─── Serverless handler (Vercel) ──────────────────────────────────────────
export default async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const app = await createApp();
  const httpAdapter = app.getHttpAdapter().getInstance() as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;
  httpAdapter(req, res);
};

// ─── Local development server ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  void (async (): Promise<void> => {
    const app = await createApp();
    const port = Number(process.env.PORT ?? 3001);
    await app.listen(port);
    const logger = new Logger('Bootstrap');
    logger.log(`API running on http://localhost:${port}`);
    logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
  })();
}
