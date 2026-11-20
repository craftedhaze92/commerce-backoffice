import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Shared by main.ts and the e2e harness. Serves UI at /api/docs and JSON at /api/docs-json. */
export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Commerce Back-office API')
      .setVersion('0.0.1')
      .addCookieAuth('bo_at', undefined, 'bo_at')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
}
