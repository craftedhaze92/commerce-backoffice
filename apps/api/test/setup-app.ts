import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { validateEnv } from '../src/config/env.js';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  stop(): Promise<void>;
}

/** Boots the real AppModule (same wiring as main.ts) against a throwaway Postgres container. */
export async function createTestApp(): Promise<TestApp> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: container.getConnectionUri(),
    JWT_SECRET: 'test-secret-test-secret-test-secret-0123',
    WEB_ORIGIN: 'http://localhost:3000',
  });

  let app: INestApplication | undefined;
  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, validateEnv(process.env));
    await app.init();
    await app.get(DataSource).runMigrations();
  } catch (err) {
    await app?.close().catch(() => undefined);
    await container.stop();
    throw err;
  }

  const dataSource = app.get(DataSource);
  const startedApp = app;

  return {
    app: startedApp,
    dataSource,
    async stop() {
      await startedApp.close();
      await container.stop();
    },
  };
}
