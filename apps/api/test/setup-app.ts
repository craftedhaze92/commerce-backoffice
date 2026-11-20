import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { validateEnv } from '../src/config/env.js';

const S3_BUCKET = 'bo-media';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  s3: { endpoint: string; bucket: string };
  stop(): Promise<void>;
}

/** Boots the real AppModule (same wiring as main.ts) against a throwaway Postgres container. */
export async function createTestApp(): Promise<TestApp> {
  const [container, s3Container] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new GenericContainer('adobe/s3mock:4.11.0')
      .withExposedPorts(9090)
      .withEnvironment({ COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS: S3_BUCKET })
      .withWaitStrategy(Wait.forHttp('/', 9090).forStatusCodeMatching((c) => c < 500))
      .start(),
  ]);
  const s3Endpoint = `http://${s3Container.getHost()}:${s3Container.getMappedPort(9090)}`;
  Object.assign(process.env, {
    S3_ENDPOINT: s3Endpoint,
    S3_REGION: 'us-east-1',
    S3_BUCKET,
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
    S3_FORCE_PATH_STYLE: 'true',
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
    await Promise.all([container.stop(), s3Container.stop()]);
    throw err;
  }

  const dataSource = app.get(DataSource);
  const startedApp = app;

  return {
    app: startedApp,
    dataSource,
    s3: { endpoint: s3Endpoint, bucket: S3_BUCKET },
    async stop() {
      await startedApp.close();
      await Promise.all([container.stop(), s3Container.stop()]);
    },
  };
}
