import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import request from 'supertest';
import { SelectQueryBuilder } from 'typeorm';
import { EXPORT_LIMITS, Role } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/auth/password.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/orders/export';
// node-postgres default pool size (the app does not override it).
const POOL_SIZE = 10;
const BATCHES = EXPORT_LIMITS.maxRows / EXPORT_LIMITS.batchSize;

/** The real getRawMany, read before it is spied on. */
const originalGetRawMany = () =>
  Object.getOwnPropertyDescriptor(SelectQueryBuilder.prototype, 'getRawMany')!.value as (
    this: SelectQueryBuilder<object>,
  ) => Promise<unknown[]>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Shared streaming flow (common/xlsx/stream-export.ts), exercised through GET /orders/export.
 * Batch reads go through SelectQueryBuilder.getRawMany, so spying on it slows or breaks batches.
 */
describe('xlsx export streaming robustness (e2e)', () => {
  let t: TestApp;
  let cookie: string;
  let server: http.Server;

  beforeAll(async () => {
    t = await createTestApp();
    server = t.app.getHttpServer() as http.Server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });
  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    const ds = t.dataSource;
    await ds.query(
      'TRUNCATE users, products, categories, orders, order_sequences RESTART IDENTITY CASCADE',
    );
    const users = ds.getRepository(User);
    await users.save(
      users.create({
        email: 'manager@demo.com',
        name: 'manager',
        role: Role.MANAGER,
        passwordHash: await hashPassword(PW),
      }),
    );
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'manager@demo.com', password: PW });
    const raw = res.headers['set-cookie'] as unknown as string[];
    cookie = raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const insertMany = (n: number) =>
    t.dataSource.query(
      `INSERT INTO orders ("orderNo","customerName",status,"totalAmount","createdAt","updatedAt")
       SELECT 'ORD-' || lpad(g::text, 6, '0'), 'c' || g, 'PENDING', 1000, now(), now()
       FROM generate_series(1, $1::int) g`,
      [n],
    );

  /** Starts a download and destroys the socket as soon as the first body bytes arrive. */
  const abortAfterFirstChunk = () =>
    new Promise<{ completed: boolean }>((resolve, reject) => {
      const { port } = server.address() as AddressInfo;
      const req = http.get({ host: '127.0.0.1', port, path: URL, headers: { Cookie: cookie } });
      req.on('response', (res) => {
        if (res.statusCode !== 200) reject(new Error(`status ${res.statusCode}`));
        res.once('data', () => {
          req.destroy();
          resolve({ completed: false });
        });
        res.on('end', () => resolve({ completed: true }));
      });
      req.on('error', () => undefined); // our own destroy
    });

  /** Connections of this test database still inside a transaction (excluding this query's). */
  const openTransactions = async (): Promise<number> => {
    const [{ n }] = (await t.dataSource.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start IS NOT NULL`,
    )) as Array<{ n: number }>;
    return n;
  };

  const waitFor = async (cond: () => Promise<boolean>, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (!(await cond())) {
      if (Date.now() > deadline) throw new Error('timed out');
      await sleep(50);
    }
  };

  it('client abort mid-download stops batch reads and frees the connection (repeated ≥ pool size)', async () => {
    await insertMany(EXPORT_LIMITS.maxRows);
    const original = originalGetRawMany();
    let batchReads = 0;
    vi.spyOn(SelectQueryBuilder.prototype, 'getRawMany').mockImplementation(async function (
      this: SelectQueryBuilder<object>,
    ) {
      batchReads++;
      await sleep(100); // keeps the export running well past the first chunk
      return original.call(this);
    });

    for (let i = 0; i < POOL_SIZE + 2; i++) {
      batchReads = 0;
      const { completed } = await abortAfterFirstChunk();
      expect(completed).toBe(false);
      // The transaction ends (connection back in the pool) without reading every batch.
      await waitFor(async () => (await openTransactions()) === 0, 5_000);
      const readsAtEnd = batchReads;
      await sleep(300);
      expect(batchReads).toBe(readsAtEnd);
      expect(batchReads).toBeLessThan(BATCHES);
    }

    vi.restoreAllMocks();
    const list = await request(server)
      .get('/api/v1/orders?size=1')
      .set('Cookie', cookie)
      .timeout(5_000);
    expect(list.status).toBe(200);
    const full = await request(server).get(URL).set('Cookie', cookie).timeout(30_000);
    expect(full.status).toBe(200);
  }, 120_000);

  it('failure on the second batch destroys the response and logs it', async () => {
    await insertMany(EXPORT_LIMITS.batchSize + 500);
    const original = originalGetRawMany();
    let calls = 0;
    vi.spyOn(SelectQueryBuilder.prototype, 'getRawMany').mockImplementation(function (
      this: SelectQueryBuilder<object>,
    ) {
      calls++;
      if (calls === 2) return Promise.reject(new Error('boom on batch 2'));
      return original.call(this);
    });
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const outcome = await new Promise<'end' | 'error'>((resolve) => {
      const { port } = server.address() as AddressInfo;
      const req = http.get({ host: '127.0.0.1', port, path: URL, headers: { Cookie: cookie } });
      req.on('response', (res) => {
        expect(res.statusCode).toBe(200);
        res.resume();
        res.on('end', () => resolve('end'));
        res.on('error', () => resolve('error'));
        res.on('aborted', () => resolve('error'));
      });
      req.on('error', () => resolve('error'));
    });

    expect(outcome).toBe('error');
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('boom on batch 2'),
      expect.anything(),
    );
    await waitFor(async () => (await openTransactions()) === 0, 5_000);
  }, 60_000);
});
