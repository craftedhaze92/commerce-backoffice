import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasRole, type Role } from '@bo/contracts';
import { AppException } from '../common/app-exception.js';
import { type AuthUser, ROLES_KEY } from '../common/decorators.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !required.some((r) => hasRole(user.role, r))) {
      throw new AppException(403, 'FORBIDDEN', 'Forbidden');
    }
    return true;
  }
}
