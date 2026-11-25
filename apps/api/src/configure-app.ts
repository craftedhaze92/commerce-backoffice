import { type INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env.js';
import { API_PREFIX } from './common/api-prefix.js';
import { AppException } from './common/app-exception.js';
import { AllExceptionsFilter } from './common/http-exception.filter.js';

function flatten(errors: ValidationError[], parent = ''): { field: string; messages: string[] }[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = e.constraints ? [{ field, messages: Object.values(e.constraints) }] : [];
    return [...own, ...flatten(e.children ?? [], field)];
  });
}

/** Shared by main.ts and the e2e harness. Guards are registered via APP_GUARD, not here. */
export function configureApp(app: INestApplication, env: Env): void {
  // Behind N reverse proxies (Vercel, Render, ...), req.ip is the N-th address from the right of
  // X-Forwarded-For. 0 keeps Express's default: the header is ignored, so it cannot be spoofed.
  if (env.TRUST_PROXY > 0) (app as NestExpressApplication).set('trust proxy', env.TRUST_PROXY);
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new AppException(400, 'VALIDATION_FAILED', 'Validation failed', flatten(errors)),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
