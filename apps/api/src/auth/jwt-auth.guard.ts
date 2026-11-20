import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AppException } from '../common/app-exception.js';
import { IS_PUBLIC_KEY } from '../common/decorators.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  override handleRequest<T>(err: unknown, user: T | false): T {
    if (err instanceof AppException) throw err;
    if (err || !user) throw new AppException(401, 'UNAUTHORIZED', 'Unauthorized');
    return user;
  }
}
