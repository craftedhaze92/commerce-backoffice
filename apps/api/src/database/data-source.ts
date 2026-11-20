import type { DataSourceOptions } from 'typeorm';
import type { Env } from '../config/env.js';

/**
 * Resolved relative to this file so migrations load from source (.ts, Vitest)
 * and from the build output (.js) alike. The extension follows this file's own
 * so the emitted .d.ts declaration files are never picked up.
 */
const ext = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
const migrationsGlob = `${import.meta.dirname}/migrations/*.${ext}`;

export function buildDataSourceOptions(env: Env): DataSourceOptions {
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    synchronize: false,
    migrations: [migrationsGlob],
  };
}
