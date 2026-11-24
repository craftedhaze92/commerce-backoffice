import { CanActivate, Inject, Injectable } from '@nestjs/common';
import { AppException } from '../common/app-exception.js';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';

/** Hides development-only endpoints in production (404, as if the route did not exist). */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(): boolean {
    if (this.env.NODE_ENV === 'production') throw new AppException(404, 'NOT_FOUND', 'Not Found');
    return true;
  }
}
