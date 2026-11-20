import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { MeResponse } from '@bo/contracts';
import { AppException } from '../common/app-exception.js';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { RefreshTokenService } from './refresh-token.service.js';

/** Verified against when the email is unknown, so timing matches a real check. */
const DUMMY_HASH = await hashPassword('dummy-password-for-timing');

export const toMe = (u: User): MeResponse => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ user: User; access: string; refreshRaw: string }> {
    const user = await this.users.findByEmail(email);
    const ok = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
    if (!user || !ok || !user.isActive) {
      throw new AppException(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }
    const access = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: this.env.ACCESS_TTL_SEC },
    );
    const { raw } = await this.refreshTokens.issue(user.id);
    return { user, access, refreshRaw: raw };
  }

  async logout(refreshRaw: string | undefined): Promise<void> {
    if (refreshRaw) await this.refreshTokens.revokeFamilyByRaw(refreshRaw);
  }
}
