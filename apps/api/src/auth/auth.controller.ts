import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-error.schema.js';
import type { Request, Response } from 'express';
import type { MeResponse } from '@bo/contracts';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { UsersService } from '../users/users.service.js';
import { AuthService, toMe } from './auth.service.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './auth-cookies.js';
import { type AuthUser, CurrentUser, Public } from '../common/decorators.js';
import { LoginDto } from './dto/login.dto.js';
import { LoginThrottleGuard } from './login-throttle.guard.js';
import { AppException } from '../common/app-exception.js';

@ApiTags('auth')
@ApiErrors(401)
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
  @UseGuards(LoginThrottleGuard)
  @ApiErrors(400, 429)
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
  @Post('refresh')
  @HttpCode(204)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    try {
      const { access, refreshRaw } = await this.auth.refresh(
        req.cookies?.[REFRESH_COOKIE] as string | undefined,
      );
      setAuthCookies(res, access, refreshRaw, this.env);
    } catch (err) {
      // Dead refresh token: drop bo_at too, otherwise the web proxy keeps treating the
      // browser as signed in and bounces /login <-> /dashboard forever.
      clearAuthCookies(res, this.env);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearAuthCookies(res, this.env);
  }
}
