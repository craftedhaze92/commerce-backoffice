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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, validateEnv(process.env));
  await app.init();

  const dataSource = app.get(DataSource);
  await dataSource.runMigrations();

  return {
    app,
    dataSource,
    async stop() {
      await app.close();
      await container.stop();
    },
  };
}
