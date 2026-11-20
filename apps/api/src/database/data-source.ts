import type { DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env.js';

export function buildDataSourceOptions(env: Env): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    synchronize: false,
    migrations: ['dist/database/migrations/*.js'],
  };
}
