import { createHash } from 'node:crypto';
import request, { type Response } from 'supertest';
import { Role } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/auth/password.js';
import { RefreshToken } from '../src/auth/refresh-token.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';

describe('auth refresh (e2e)', () => {
  let t: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;
  let seq = 0;

  beforeAll(async () => {
    t = await createTestApp();
    server = t.app.getHttpServer();
  });

  afterAll(async () => {
    await t?.stop();
  });

  /** Each test gets its own user so state never leaks between tests. */
  const newUser = async (): Promise<{ id: string; email: string }> => {
    const repo = t.dataSource.getRepository(User);
    const email = `u${++seq}@demo.com`;
    const u = await repo.save(
      repo.create({ email, name: 'u', role: Role.VIEWER, passwordHash: await hashPassword(PW) }),
    );
    return { id: u.id, email };
  };

  const setCookies = (res: Response): string[] => {
    const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  };
  const pick = (res: Response, name: string): string => {
    const c = setCookies(res).find((s) => s.startsWith(`${name}=`));
    if (!c) throw new Error(`cookie ${name} not set`);
    return c;
  };
  const rawOf = (res: Response, name: string) =>
    decodeURIComponent(pick(res, name).split(';')[0]!.slice(name.length + 1));

  const loginAs = async (email: string) => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email, password: PW });
    expect(res.status).toBe(200);
    return rawOf(res, 'bo_rt');
  };
  const refreshRaw = (rt?: string) => {
    const r = request(server).post('/api/v1/auth/refresh').set('X-Requested-With', 'fetch');
    return rt === undefined ? r : r.set('Cookie', `bo_rt=${encodeURIComponent(rt)}`);
  };
  const sha = (v: string) => createHash('sha256').update(v).digest('hex');

  it('refresh issues new cookies and old refresh becomes invalid', async () => {
    const { email } = await newUser();
    const rt1 = await loginAs(email);
    const res = await refreshRaw(rt1);
    expect(res.status).toBe(204);
    const at = pick(res, 'bo_at');
    const rt = pick(res, 'bo_rt');
    expect(at).toMatch(/HttpOnly/);
    expect(at).toMatch(/SameSite=Lax/);
    expect(at).toMatch(/Path=\/(;|$)/);
    expect(at).toMatch(/Max-Age=604800/);
    expect(rt).toMatch(/HttpOnly/);
    expect(rt).toMatch(/SameSite=Strict/);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/);
    expect(rt).toMatch(/Max-Age=604800/);
    const rt2 = rawOf(res, 'bo_rt');
    expect(rt2).not.toBe(rt1);

    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Cookie', `bo_at=${rawOf(res, 'bo_at')}`);
    expect(me.status).toBe(200);

    const repo = t.dataSource.getRepository(RefreshToken);
    const old = await repo.findOneByOrFail({ tokenHash: sha(rt1) });
    const next = await repo.findOneByOrFail({ tokenHash: sha(rt2) });
    expect(old.revokedAt).toBeInstanceOf(Date);
    expect(old.replacedById).toBe(next.id);
    expect(next.familyId).toBe(old.familyId);
    expect(next.revokedAt).toBeNull();
  });

  it('reusing an already-rotated refresh → 401 TOKEN_REUSED and revokes the whole family', async () => {
    const { email } = await newUser();
    const rt1 = await loginAs(email);
    const rt2 = rawOf(await refreshRaw(rt1), 'bo_rt');
    const reuse = await refreshRaw(rt1);
    expect(reuse.status).toBe(401);
    expect(reuse.body).toEqual({
      statusCode: 401,
      code: 'TOKEN_REUSED',
      message: expect.any(String),
    });
    const legit = await refreshRaw(rt2);
    expect(legit.status).toBe(401);

    const repo = t.dataSource.getRepository(RefreshToken);
    const rec = await repo.findOneByOrFail({ tokenHash: sha(rt1) });
    const family = await repo.findBy({ familyId: rec.familyId });
    expect(family).toHaveLength(2);
    expect(family.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('two parallel refreshes with the same token → exactly one 204, the other 401, family revoked', async () => {
    const { email } = await newUser();
    const rt1 = await loginAs(email);
    const [a, b] = await Promise.all([refreshRaw(rt1), refreshRaw(rt1)]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([204, 401]);
    const loser = a.status === 401 ? a : b;
    expect(loser.body.code).toBe('TOKEN_REUSED');

    const repo = t.dataSource.getRepository(RefreshToken);
    const rec = await repo.findOneByOrFail({ tokenHash: sha(rt1) });
    const family = await repo.findBy({ familyId: rec.familyId });
    expect(family.every((r) => r.revokedAt !== null)).toBe(true);
    const winner = a.status === 204 ? a : b;
    expect((await refreshRaw(rawOf(winner, 'bo_rt'))).status).toBe(401);
  });

  it('expired refresh → 401 UNAUTHORIZED', async () => {
    const { email } = await newUser();
    const rt1 = await loginAs(email);
    await t.dataSource
      .getRepository(RefreshToken)
      .update({ tokenHash: sha(rt1) }, { expiresAt: new Date(Date.now() - 1000) });
    const res = await refreshRaw(rt1);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('refresh for deactivated user → 401 UNAUTHORIZED', async () => {
    const { id, email } = await newUser();
    const rt1 = await loginAs(email);
    await t.dataSource.getRepository(User).update({ id }, { isActive: false });
    const res = await refreshRaw(rt1);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('unknown token and missing cookie → 401 UNAUTHORIZED', async () => {
    const unknown = await refreshRaw('does-not-exist');
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: expect.any(String),
    });
    const missing = await refreshRaw();
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('UNAUTHORIZED');
  });
});
