import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Role } from '@bo/contracts';
import { AppException } from '../common/app-exception.js';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { UsersService } from '../users/users.service.js';
import { ACCESS_COOKIE } from './auth-cookies.js';
import type { AuthUser } from './decorators.js';

export interface JwtPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ENV) env: Env,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => (req?.cookies?.[ACCESS_COOKIE] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  /** Re-reads the user every request so role/active changes apply immediately. */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new AppException(401, 'UNAUTHORIZED', 'Unauthorized');
    }
    return { id: user.id, role: user.role };
  }
}
