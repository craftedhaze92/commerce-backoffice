import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.js';
import { configureApp } from './configure-app.js';
import { setupSwagger } from './swagger.js';

async function bootstrap() {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, env);
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });

  setupSwagger(app);

  await app.listen(env.PORT);
}
await bootstrap();
