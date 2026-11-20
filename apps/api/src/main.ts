import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { validateEnv } from './config/env.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app, env);
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Commerce Back-office API').setVersion('0.0.1').build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(env.PORT);
}
await bootstrap();
