import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from './app-exception.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** State-changing requests must carry `X-Requested-With: fetch` (forces a CORS preflight). */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) return true;
    if (req.headers['x-requested-with'] !== 'fetch') {
      throw new AppException(403, 'CSRF_REQUIRED', 'X-Requested-With: fetch header is required');
    }
    return true;
  }
}
