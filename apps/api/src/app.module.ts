import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { ENV, EnvModule } from './config/env.module.js';
import type { Env } from './config/env.js';
import { buildDataSourceOptions } from './database/data-source.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [
    EnvModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.NODE_ENV === 'test' ? 'silent' : 'info',
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
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
})
export class AppModule {}
