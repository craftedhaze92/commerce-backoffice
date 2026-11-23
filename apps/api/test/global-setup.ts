import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';
import { buildDataSourceOptions } from '../src/database/data-source.js';
import type { Env } from '../src/config/env.js';

export const TEMPLATE_DB = 'bo_template';

export interface TestInfra {
  pgHost: string;
  pgPort: number;
  pgUser: string;
  pgPassword: string;
  s3Endpoint: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    infra: TestInfra;
  }
}

/**
 * One Postgres + one s3mock for the whole e2e run. Migrations run once into a
 * template database; each test file clones it (see setup-app.ts).
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const [pgResult, s3Result] = await Promise.allSettled([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new GenericContainer('adobe/s3mock:4.11.0')
      .withExposedPorts(9090)
      .withWaitStrategy(Wait.forHttp('/', 9090).forStatusCodeMatching((c) => c < 500))
      .start(),
  ]);
  if (pgResult.status === 'rejected' || s3Result.status === 'rejected') {
    if (pgResult.status === 'fulfilled') await pgResult.value.stop();
    if (s3Result.status === 'fulfilled') await s3Result.value.stop();
    throw pgResult.status === 'rejected'
      ? pgResult.reason
      : (s3Result as PromiseRejectedResult).reason;
  }
  const pg = pgResult.value;
  const s3 = s3Result.value;
  const stop = async () => {
    await Promise.all([pg.stop(), s3.stop()]);
  };

  try {
    const admin = new DataSource({ type: 'postgres', url: pg.getConnectionUri() });
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${TEMPLATE_DB}"`);
    await admin.destroy();

    const url = new URL(pg.getConnectionUri());
    url.pathname = `/${TEMPLATE_DB}`;
    const migrator = new DataSource(
      buildDataSourceOptions({ DATABASE_URL: url.toString() } as Env),
    );
    await migrator.initialize();
    await migrator.runMigrations();
    await migrator.destroy();
  } catch (err) {
    await stop();
    throw err;
  }

  project.provide('infra', {
    pgHost: pg.getHost(),
    pgPort: pg.getPort(),
    pgUser: pg.getUsername(),
    pgPassword: pg.getPassword(),
    s3Endpoint: `http://${s3.getHost()}:${s3.getMappedPort(9090)}`,
  });

  return stop;
}
