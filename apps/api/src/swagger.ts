import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ApiErrorBody } from './common/api-error.schema.js';

/** The same document the UI serves; the e2e suite inspects it directly. */
export function buildSwaggerDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Commerce Back-office API')
      .setVersion('0.0.1')
      .addCookieAuth('bo_at', undefined, 'bo_at')
      .build(),
    { extraModels: [ApiErrorBody], autoTagControllers: false },
  );
}

/** Shared by main.ts. Serves UI at /api/docs and JSON at /api/docs-json (also in production: public demo). */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, buildSwaggerDocument(app));
}
