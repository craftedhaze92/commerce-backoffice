import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { LoginThrottleGuard } from './login-throttle.guard.js';
import { RefreshToken } from './refresh-token.entity.js';
import { RefreshTokenService } from './refresh-token.service.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken]),
    // Only LoginThrottleGuard (on POST /auth/login) consumes this; no global ThrottlerGuard.
    // In-memory storage: counters are per process and reset on restart (single instance).
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [{ ttl: env.LOGIN_THROTTLE_TTL_SEC * 1000, limit: env.LOGIN_THROTTLE_LIMIT }],
        errorMessage: 'Too many login attempts',
      }),
    }),
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshTokenService, LoginThrottleGuard],
  exports: [RefreshTokenService],
})
export class AuthModule {}
