import { createHash } from 'node:crypto';
import request, { type Response } from 'supertest';
import { Role } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/auth/password.js';
import { RefreshToken } from '../src/auth/refresh-token.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';

describe('auth (e2e)', () => {
  let t: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;

  beforeAll(async () => {
    t = await createTestApp();
    server = t.app.getHttpServer();
    const passwordHash = await hashPassword(PW);
    const repo = t.dataSource.getRepository(User);
    await repo.save([
      repo.create({ email: 'admin@demo.com', name: '관리자', role: Role.ADMIN, passwordHash }),
      repo.create({ email: 'viewer@demo.com', name: '뷰어', role: Role.VIEWER, passwordHash }),
    ]);
  });

  afterAll(async () => {
    await t?.stop();
  });

  const login = (email: unknown, password: unknown) =>
    request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email, password });

  const cookies = (res: Response): string[] => {
    const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  };
  const pick = (res: Response, name: string): string => {
    const c = cookies(res).find((s) => s.startsWith(`${name}=`));
    if (!c) throw new Error(`cookie ${name} not set`);
    return c;
  };
  const cookieHeader = (res: Response) =>
    ['bo_at', 'bo_rt'].map((n) => pick(res, n).split(';')[0]!).join('; ');

  it('login sets bo_at and bo_rt cookies with spec attributes', async () => {
    const res = await login('admin@demo.com', PW);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: 'admin@demo.com',
      name: expect.any(String),
      role: 'ADMIN',
    });
    const at = pick(res, 'bo_at');
    const rt = pick(res, 'bo_rt');
    expect(at).toMatch(/HttpOnly/);
    expect(at).toMatch(/Path=\/(;|$)/);
    expect(at).toMatch(/SameSite=Lax/);
    expect(at).toMatch(/Max-Age=604800/);
    expect(at).not.toMatch(/Secure/);
    expect(rt).toMatch(/HttpOnly/);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/);
    expect(rt).toMatch(/SameSite=Strict/);
    expect(rt).toMatch(/Max-Age=604800/);
    expect(rt).not.toMatch(/Secure/);
  });

  it('access JWT carries sub/role and expires in 15 minutes', async () => {
    const res = await login('admin@demo.com', PW);
    const token = pick(res, 'bo_at').split(';')[0]!.slice('bo_at='.length);
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as {
      sub: string;
      role: string;
      exp: number;
      iat: number;
    };
    expect(payload.sub).toBe(res.body.id);
    expect(payload.role).toBe('ADMIN');
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('login stores a hashed refresh token record', async () => {
    const res = await login('admin@demo.com', PW);
    const raw = decodeURIComponent(pick(res, 'bo_rt').split(';')[0]!.slice('bo_rt='.length));
    const records = await t.dataSource.getRepository(RefreshToken).findBy({ userId: res.body.id });
    expect(records.length).toBeGreaterThan(0);
    expect(records.some((r) => r.tokenHash === sha256(raw))).toBe(true);
    expect(records.some((r) => r.tokenHash === raw)).toBe(false);
  });

  it('login normalizes email', async () => {
    expect((await login('  Admin@Demo.com ', PW)).status).toBe(200);
  });

  it('wrong password and unknown email return identical 401 INVALID_CREDENTIALS', async () => {
    const a = await login('admin@demo.com', 'wrong');
    const b = await login('ghost@demo.com', 'wrong');
    expect(a.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('inactive user cannot log in', async () => {
    const repo = t.dataSource.getRepository(User);
    await repo.save(
      repo.create({
        email: 'off@demo.com',
        name: 'off',
        passwordHash: await hashPassword(PW),
        isActive: false,
      }),
    );
    const res = await login('off@demo.com', PW);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('login with invalid body → 400 VALIDATION_FAILED with details', async () => {
    const res = await login('not-an-email', '');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: expect.any(String),
      details: expect.arrayContaining([
        { field: 'email', messages: expect.any(Array) },
        { field: 'password', messages: expect.any(Array) },
      ]),
    });
  });

  it('GET /auth/me without cookie → 401 UNAUTHORIZED', async () => {
    const res = await request(server).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('GET /auth/me ignores Authorization header', async () => {
    const res = await login('admin@demo.com', PW);
    const token = pick(res, 'bo_at').split(';')[0]!.slice('bo_at='.length);
    const me = await request(server).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  it('GET /auth/me with cookie → MeResponse', async () => {
    const res = await login('admin@demo.com', PW);
    const me = await request(server).get('/api/v1/auth/me').set('Cookie', cookieHeader(res));
    expect(me.status).toBe(200);
    expect(me.body).toEqual({
      id: res.body.id,
      email: 'admin@demo.com',
      name: '관리자',
      role: 'ADMIN',
    });
  });

  it('role changes and deactivation take effect immediately', async () => {
    const res = await login('viewer@demo.com', PW);
    const repo = t.dataSource.getRepository(User);
    await repo.update({ id: res.body.id }, { role: Role.MANAGER });
    const me = await request(server).get('/api/v1/auth/me').set('Cookie', cookieHeader(res));
    expect(me.body.role).toBe('MANAGER');
    await repo.update({ id: res.body.id }, { isActive: false });
    const after = await request(server).get('/api/v1/auth/me').set('Cookie', cookieHeader(res));
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('UNAUTHORIZED');
    await repo.update({ id: res.body.id }, { role: Role.VIEWER, isActive: true });
  });

  it('logout returns 204, clears both cookies and revokes the refresh family', async () => {
    const res = await login('admin@demo.com', PW);
    const out = await request(server)
      .post('/api/v1/auth/logout')
      .set('X-Requested-With', 'fetch')
      .set('Cookie', cookieHeader(res));
    expect(out.status).toBe(204);
    const at = pick(out, 'bo_at');
    const rt = pick(out, 'bo_rt');
    for (const c of [at, rt]) expect(c).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(at).toMatch(/Path=\/(;|$)/);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/);
    const raw = decodeURIComponent(pick(res, 'bo_rt').split(';')[0]!.slice('bo_rt='.length));
    const repo = t.dataSource.getRepository(RefreshToken);
    const rec = await repo.findOneByOrFail({ tokenHash: sha256(raw) });
    expect(rec.revokedAt).toBeInstanceOf(Date);
    const family = await repo.findBy({ familyId: rec.familyId });
    expect(family.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('logout without cookies is still 204', async () => {
    const out = await request(server).post('/api/v1/auth/logout').set('X-Requested-With', 'fetch');
    expect(out.status).toBe(204);
  });

  // Needs POST /auth/refresh; enabled in Task 5.
  it.todo('after logout, POST /auth/refresh with the old bo_rt → 401');
});

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}
