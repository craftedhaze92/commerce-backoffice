import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { MeResponse } from '@bo/contracts';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { UsersService } from '../users/users.service.js';
import { AuthService, toMe } from './auth.service.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './auth-cookies.js';
import { type AuthUser, CurrentUser, Public } from './decorators.js';
import { LoginDto } from './dto/login.dto.js';
import { AppException } from '../common/app-exception.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const { user, access, refreshRaw } = await this.auth.login(dto.email, dto.password);
    setAuthCookies(res, access, refreshRaw, this.env);
    return toMe(user);
  }

  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<MeResponse> {
    const user = await this.users.findById(current.id);
    if (!user) throw new AppException(401, 'UNAUTHORIZED', 'Unauthorized');
    return toMe(user);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearAuthCookies(res, this.env);
  }
}
