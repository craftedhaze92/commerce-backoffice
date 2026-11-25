import request, { type Response } from 'supertest';
import { Role } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { RefreshTokenService } from '../src/auth/refresh-token.service.js';
import { RefreshToken } from '../src/auth/refresh-token.entity.js';
import { setupSwagger } from '../src/swagger.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';

describe('rbac + csrf (e2e)', () => {
  let t: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;

  beforeAll(async () => {
    t = await createTestApp();
    server = t.app.getHttpServer();
  });

  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    await t.dataSource.query('TRUNCATE users CASCADE');
    const passwordHash = await hashPassword(PW);
    const repo = t.dataSource.getRepository(User);
    await repo.save(
      (['admin', 'manager', 'viewer'] as const).map((r) =>
        repo.create({
          email: `${r}@demo.com`,
          name: r,
          role: r.toUpperCase() as Role,
          passwordHash,
        }),
      ),
    );
  });

  const loginRes = (name: string) =>
    request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: `${name}@demo.com`, password: PW });
  const cookieOf = (res: Response, name: string) => {
    const raw = res.headers['set-cookie'] as unknown as string[];
    return raw.find((s) => s.startsWith(`${name}=`))!.split(';')[0]!;
  };
  const loginAs = async (name: string) => cookieOf(await loginRes(name), 'bo_at');

  it.each([
    ['admin', 200],
    ['manager', 403],
    ['viewer', 403],
  ])('GET /users as %s -> %i', async (name, status) => {
    const cookie = await loginAs(name);
    const res = await request(server).get('/api/v1/users').set('Cookie', cookie);
    expect(res.status).toBe(status);
  });

  it('GET /users without a cookie -> 401', async () => {
    expect((await request(server).get('/api/v1/users')).status).toBe(401);
  });

  it('403 body is FORBIDDEN ApiErrorBody', async () => {
    const cookie = await loginAs('viewer');
    const res = await request(server).get('/api/v1/users').set('Cookie', cookie);
    expect(res.body).toEqual({ statusCode: 403, code: 'FORBIDDEN', message: expect.any(String) });
  });

  it('POST without X-Requested-With -> 403 CSRF_REQUIRED', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@demo.com', password: PW });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      statusCode: 403,
      code: 'CSRF_REQUIRED',
      message: expect.any(String),
    });
  });

  it('POST with a wrong X-Requested-With value -> 403 CSRF_REQUIRED', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ email: 'admin@demo.com', password: PW });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REQUIRED');
  });

  it('GET without X-Requested-With still works', async () => {
    const cookie = await loginAs('viewer');
    expect((await request(server).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('rejects deactivated user with valid access token', async () => {
    const cookie = await loginAs('manager');
    await t.dataSource.query(`UPDATE users SET "isActive"=false WHERE email='manager@demo.com'`);
    expect((await request(server).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('role change takes effect without re-login', async () => {
    const cookie = await loginAs('viewer');
    expect((await request(server).get('/api/v1/users').set('Cookie', cookie)).status).toBe(403);
    await t.dataSource.query(`UPDATE users SET role='ADMIN' WHERE email='viewer@demo.com'`);
    expect((await request(server).get('/api/v1/users').set('Cookie', cookie)).status).toBe(200);
  });

  it('GET /users meta: size=2 over 3 users -> totalPages 2', async () => {
    const cookie = await loginAs('admin');
    const res = await request(server).get('/api/v1/users?size=2').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.meta).toEqual({ page: 1, size: 2, total: 3, totalPages: 2 });
  });

  it.each(['size=101', 'size=0', 'page=0', 'page=abc', 'foo=1'])(
    'GET /users?%s -> 400 VALIDATION_FAILED',
    async (qs) => {
      const cookie = await loginAs('admin');
      const res = await request(server).get(`/api/v1/users?${qs}`).set('Cookie', cookie);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    },
  );

  it('revokeAllForUser revokes every refresh token and refresh then fails with 401', async () => {
    const first = await loginRes('viewer');
    const second = await loginRes('viewer');
    const rts = [first, second].map((r) => cookieOf(r, 'bo_rt'));
    const user = await t.dataSource.getRepository(User).findOneByOrFail({
      email: 'viewer@demo.com',
    });

    await t.app.get(RefreshTokenService).revokeAllForUser(user.id);

    const rows = await t.dataSource.getRepository(RefreshToken).findBy({ userId: user.id });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    for (const rt of rts) {
      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .set('X-Requested-With', 'fetch')
        .set('Cookie', rt);
      expect(res.status).toBe(401);
    }
  });

  it('swagger JSON documents the users path and cookie auth', async () => {
    setupSwagger(t.app);
    const res = await request(server).get('/api/docs-json');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths)).toContain('/api/v1/users');
    expect(res.body.components.securitySchemes).toHaveProperty('bo_at');
    const update = res.body.components.schemas.UpdateProductDto;
    expect(update.required ?? []).toEqual([]);
    expect(Object.keys(update.properties).sort()).toEqual([
      'categoryId',
      'description',
      'images',
      'name',
      'price',
      'safetyStock',
      'sku',
      'status',
    ]);
  });
});
