import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { RolesGuard } from './auth/roles.guard.js';
import { CategoriesModule } from './categories/categories.module.js';
import { CsrfGuard } from './common/csrf.guard.js';
import { ENV, EnvModule } from './config/env.module.js';
import type { Env } from './config/env.js';
import { buildDataSourceOptions } from './database/data-source.js';
import { HealthController } from './health/health.controller.js';
import { ProductsModule } from './products/products.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    EnvModule,
    StorageModule,
    UsersModule,
    AuthModule,
    CategoriesModule,
    ProductsModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : 'info',
          redact: {
            paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
            censor: '[Redacted]',
          },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ ...buildDataSourceOptions(env), autoLoadEntities: true }),
    }),
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: CSRF -> authenticate -> authorize.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
