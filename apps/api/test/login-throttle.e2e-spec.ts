import request from 'supertest';
import { Role } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const THROTTLE_ENV = { LOGIN_THROTTLE_LIMIT: '3', LOGIN_THROTTLE_TTL_SEC: '60' };

type Server = ReturnType<TestApp['app']['getHttpServer']>;

function login(server: Server, email: unknown, password: unknown, xff?: string) {
  const req = request(server).post('/api/v1/auth/login').set('X-Requested-With', 'fetch');
  if (xff) req.set('X-Forwarded-For', xff);
  return req.send({ email, password });
}

async function seedUser(t: TestApp): Promise<void> {
  const repo = t.dataSource.getRepository(User);
  await repo.save(
    repo.create({
      email: 'admin@demo.com',
      name: '관리자',
      role: Role.ADMIN,
      passwordHash: await hashPassword(PW),
    }),
  );
}

// Each describe owns its app; vitest runs one describe's afterAll before the next beforeAll,
// so the env overrides never overlap.
describe('login throttle (e2e), TRUST_PROXY=0', () => {
  let t: TestApp;
  let server: Server;

  beforeAll(async () => {
    t = await createTestApp({ env: { ...THROTTLE_ENV, TRUST_PROXY: '0' } });
    server = t.app.getHttpServer();
    await seedUser(t);
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('4th login for same ip+email within TTL → 429 TOO_MANY_REQUESTS with Retry-After', async () => {
    // Successful logins count too; the key uses the normalized email.
    expect((await login(server, 'admin@demo.com', PW)).status).toBe(200);
    expect((await login(server, ' ADMIN@demo.com ', 'wrong-pass')).status).toBe(401);
    expect((await login(server, 'admin@DEMO.com', 'wrong-pass')).status).toBe(401);

    const blocked = await login(server, 'admin@demo.com', PW);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      message: expect.any(String),
    });
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(blocked.headers['set-cookie']).toBeUndefined();
  });

  it('different email from same ip is not blocked', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await login(server, 'victim@demo.com', 'wrong-pass')).status).toBe(401);
    }
    expect((await login(server, 'victim@demo.com', 'wrong-pass')).status).toBe(429);
    expect((await login(server, 'other@demo.com', 'wrong-pass')).status).toBe(401);
  });

  it('TRUST_PROXY=0: spoofed X-Forwarded-For does not reset the counter', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await login(server, 'spoof@demo.com', 'wrong-pass', `198.51.100.${i}`);
      expect(res.status).toBe(401);
    }
    const res = await login(server, 'spoof@demo.com', 'wrong-pass', '198.51.100.99');
    expect(res.status).toBe(429);
  });

  it('malformed bodies are throttled without crashing the tracker', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await login(server, 123, 'x')).status).toBe(400);
    }
    expect((await login(server, 123, 'x')).status).toBe(429);
  });

  it('other routes (GET /auth/me, /health) are not throttled', async () => {
    const ok = await login(server, 'fresh-route@demo.com', 'wrong-pass');
    expect(ok.status).toBe(401);
    for (let i = 0; i < 5; i++) {
      expect((await request(server).get('/api/v1/health')).status).toBe(200);
      expect((await request(server).get('/api/v1/auth/me')).status).toBe(401);
    }
    // Refresh is not part of the login limit either.
    for (let i = 0; i < 5; i++) {
      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .set('X-Requested-With', 'fetch');
      expect(res.status).toBe(401);
    }
  });
});

describe('login throttle (e2e), TRUST_PROXY=1', () => {
  let t: TestApp;
  let server: Server;

  beforeAll(async () => {
    t = await createTestApp({ env: { ...THROTTLE_ENV, TRUST_PROXY: '1' } });
    server = t.app.getHttpServer();
    await seedUser(t);
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('TRUST_PROXY=1: different X-Forwarded-For clients are counted separately', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await login(server, 'admin@demo.com', 'wrong-pass', '203.0.113.1');
      expect(res.status).toBe(401);
    }
    expect((await login(server, 'admin@demo.com', 'wrong-pass', '203.0.113.1')).status).toBe(429);
    // Another client behind the same proxy is unaffected, and can still sign in.
    expect((await login(server, 'admin@demo.com', PW, '203.0.113.2')).status).toBe(200);
  });

  it('TRUST_PROXY=1: only the last hop is trusted (spoofed left-most entries do not help)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await login(server, 'hop@demo.com', 'wrong-pass', `10.0.0.${i}, 203.0.113.7`);
      expect(res.status).toBe(401);
    }
    const res = await login(server, 'hop@demo.com', 'wrong-pass', '10.9.9.9, 203.0.113.7');
    expect(res.status).toBe(429);
  });
});
