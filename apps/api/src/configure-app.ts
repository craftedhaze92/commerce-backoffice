import { type INestApplication, ValidationError, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env.js';
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
export function configureApp(app: INestApplication, _env: Env): void {
  app.setGlobalPrefix('api/v1');
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
