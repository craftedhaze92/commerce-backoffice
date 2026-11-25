import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { validateEnv } from '../src/config/env.js';
import { TEMPLATE_DB } from './global-setup.js';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  s3: { endpoint: string; bucket: string };
  stop(): Promise<void>;
}

/**
 * Boots the real AppModule (same wiring as main.ts) on its own database (cloned from the
 * migrated template) and its own S3 bucket. `options.env` overrides env vars for this app only
 * (process.env is shared: the overridden keys are restored by stop(), so apps in one file should not overlap). Containers are shared and started by global-setup.ts.
 */
export async function createTestApp(
  options: {
    env?: Partial<Record<string, string>>;
    providers?: Array<{ provide: unknown; useValue: unknown }>;
  } = {},
): Promise<TestApp> {
  const infra = inject('infra');
  const suffix = randomBytes(6).toString('hex');
  const dbName = `bo_test_${suffix}`;
  const bucket = `bo-media-${suffix}`;
  const baseUrl = (db: string) =>
    `postgres://${encodeURIComponent(infra.pgUser)}:${encodeURIComponent(infra.pgPassword)}@${infra.pgHost}:${infra.pgPort}/${db}`;

  const admin = new DataSource({ type: 'postgres', url: baseUrl('postgres') });
  await admin.initialize();
  const dropDb = async () => {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.destroy();
  };

  let app: INestApplication | undefined;
  const previousEnv: Record<string, string | undefined> = {};
  const restoreEnv = () => {
    for (const [k, v] of Object.entries(previousEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  try {
    await admin.query(`CREATE DATABASE "${dbName}" TEMPLATE "${TEMPLATE_DB}"`);
    const created = await fetch(`${infra.s3Endpoint}/${bucket}`, { method: 'PUT' });
    if (!created.ok) throw new Error(`CreateBucket ${bucket} failed: ${created.status}`);

    const overrides: Record<string, string | undefined> = {
      S3_ENDPOINT: infra.s3Endpoint,
      S3_REGION: 'us-east-1',
      S3_BUCKET: bucket,
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
      S3_FORCE_PATH_STYLE: 'true',
      NODE_ENV: 'test',
      DATABASE_URL: baseUrl(dbName),
      JWT_SECRET: 'test-secret-test-secret-test-secret-0123',
      WEB_ORIGIN: 'http://localhost:3000',
      ...options.env,
    };
    for (const k of Object.keys(overrides)) {
      if (!(k in previousEnv)) previousEnv[k] = process.env[k];
    }
    Object.assign(process.env, overrides);

    let builder = Test.createTestingModule({ imports: [AppModule] });
    for (const p of options.providers ?? []) {
      builder = builder.overrideProvider(p.provide).useValue(p.useValue);
    }
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, validateEnv(process.env));
    await app.init();
  } catch (err) {
    await app?.close().catch(() => undefined);
    await dropDb().catch(() => undefined);
    restoreEnv();
    throw err;
  }

  const startedApp = app;

  return {
    app: startedApp,
    dataSource: startedApp.get(DataSource),
    s3: { endpoint: infra.s3Endpoint, bucket },
    async stop() {
      try {
        await startedApp.close();
        await dropDb();
      } finally {
        restoreEnv();
      }
    },
  };
}
