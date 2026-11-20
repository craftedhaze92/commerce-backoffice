import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ENV } from '../config/env.module.js';
import type { Env } from '../config/env.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { RefreshToken } from './refresh-token.entity.js';
import { RefreshTokenService } from './refresh-token.service.js';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ secret: env.JWT_SECRET }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshTokenService],
  exports: [RefreshTokenService],
})
export class AuthModule {}
