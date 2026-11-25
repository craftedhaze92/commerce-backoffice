import request, { type Response } from 'supertest';
import { Role, type UserListItem } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { AppException } from '../src/common/app-exception.js';
import { hashPassword } from '../src/common/password.js';
import { User } from '../src/users/user.entity.js';
import { UsersService } from '../src/users/users.service.js';

const PW = 'demo1234!';
const URL = '/api/v1/users';

type Server = ReturnType<TestApp['app']['getHttpServer']>;

const setCookies = (res: Response): string[] => {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
};
const cookieOf = (res: Response, name: string): string => {
  const c = setCookies(res).find((s) => s.startsWith(`${name}=`));
  if (!c) throw new Error(`cookie ${name} not set`);
  return c.split(';')[0]!;
};

async function seedUser(t: TestApp, email: string, role: Role, isActive = true): Promise<User> {
  const repo = t.dataSource.getRepository(User);
  return repo.save(
    repo.create({
      email,
      name: `${email}-name`,
      role,
      isActive,
      passwordHash: await hashPassword(PW),
    }),
  );
}

async function login(server: Server, email: string, password = PW) {
  return request(server)
    .post('/api/v1/auth/login')
    .set('X-Requested-With', 'fetch')
    .send({ email, password });
}

async function loginCookies(server: Server, email: string) {
  const res = await login(server, email);
  expect(res.status).toBe(200);
  return { at: cookieOf(res, 'bo_at'), rt: cookieOf(res, 'bo_rt') };
}

const post = (server: Server, cookie: string | undefined, body: object) => {
  const r = request(server).post(URL).set('X-Requested-With', 'fetch');
  return (cookie ? r.set('Cookie', cookie) : r).send(body);
};
const patch = (server: Server, cookie: string | undefined, id: string, body: object) => {
  const r = request(server).patch(`${URL}/${id}`).set('X-Requested-With', 'fetch');
  return (cookie ? r.set('Cookie', cookie) : r).send(body);
};

const USER_ITEM_KEYS = ['createdAt', 'email', 'id', 'isActive', 'name', 'role'].sort();

describe('users manage (e2e)', () => {
  let t: TestApp;
  let server: Server;
  let admin: User;
  let adminAt: string;

  beforeAll(async () => {
    t = await createTestApp();
    server = t.app.getHttpServer();
  });
  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    await t.dataSource.query('TRUNCATE users, refresh_tokens CASCADE');
    admin = await seedUser(t, 'admin@x.com', Role.ADMIN);
    adminAt = (await loginCookies(server, 'admin@x.com')).at;
  });

  const activeAdmins = async () =>
    Number(
      (
        (await t.dataSource.query(
          `SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN' AND "isActive"`,
        )) as Array<{ n: number }>
      )[0]!.n,
    );

  it('admin creates user (email normalized) → 201 UserListItem; new user can log in', async () => {
    const res = await post(server, adminAt, {
      email: '  New.User@X.COM ',
      name: '  신규 사용자 ',
      role: Role.MANAGER,
      password: 'password1',
    });
    expect(res.status).toBe(201);
    const body = res.body as UserListItem;
    expect(Object.keys(body).sort()).toEqual(USER_ITEM_KEYS);
    expect(body).toMatchObject({
      email: 'new.user@x.com',
      name: '신규 사용자',
      role: Role.MANAGER,
      isActive: true,
    });
    expect(typeof body.createdAt).toBe('string');
    const [row] = (await t.dataSource.query('SELECT "passwordHash" FROM users WHERE id = $1', [
      body.id,
    ])) as Array<{ passwordHash: string }>;
    expect(row!.passwordHash).not.toBe('password1');
    expect((await login(server, 'NEW.user@x.com', 'password1')).status).toBe(200);
  });

  it('duplicate email (case-insensitive) → 409 details.reason EMAIL_TAKEN', async () => {
    await seedUser(t, 'dup@x.com', Role.VIEWER);
    const res = await post(server, adminAt, {
      email: 'DUP@x.com',
      name: 'dup',
      role: Role.VIEWER,
      password: 'password1',
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CONFLICT', details: { reason: 'EMAIL_TAKEN' } });
  });

  const validCreate = { email: 'c@x.com', name: 'c', role: Role.VIEWER, password: 'password1' };
  it.each([
    ['password=short', { ...validCreate, password: 'short7!' }],
    ['password too long', { ...validCreate, password: 'p'.repeat(73) }],
    ['name empty', { ...validCreate, name: '   ' }],
    ['name too long', { ...validCreate, name: 'n'.repeat(51) }],
    ['role=ROOT', { ...validCreate, role: 'ROOT' }],
    ['bad email', { ...validCreate, email: 'not-an-email' }],
    ['extra field', { ...validCreate, isActive: false }],
  ])('create 400: %s', async (_label, body) => {
    const res = await post(server, adminAt, body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(await t.dataSource.query(`SELECT 1 FROM users WHERE email = 'c@x.com'`)).toHaveLength(0);
  });

  it('manager → 403 on POST and PATCH; no cookie → 401', async () => {
    const target = await seedUser(t, 'v@x.com', Role.VIEWER);
    await seedUser(t, 'm@x.com', Role.MANAGER);
    const { at } = await loginCookies(server, 'm@x.com');
    expect((await post(server, at, validCreate)).status).toBe(403);
    expect((await patch(server, at, target.id, { name: 'x' })).status).toBe(403);
    expect((await post(server, undefined, validCreate)).status).toBe(401);
    expect((await patch(server, undefined, target.id, { name: 'x' })).status).toBe(401);
  });

  it('PATCH role and name; empty body → 400; unknown id → 404', async () => {
    const target = await seedUser(t, 'v@x.com', Role.VIEWER);
    const res = await patch(server, adminAt, target.id, { role: Role.MANAGER, name: '  새 이름 ' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual(USER_ITEM_KEYS);
    expect(res.body).toMatchObject({ id: target.id, role: Role.MANAGER, name: '새 이름' });

    const empty = await patch(server, adminAt, target.id, {});
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('VALIDATION_FAILED');
    expect((await patch(server, adminAt, target.id, { name: null })).status).toBe(400);
    expect((await patch(server, adminAt, target.id, { email: 'z@x.com' })).status).toBe(400);
    expect((await patch(server, adminAt, 'not-a-uuid', { name: 'x' })).status).toBe(400);

    const missing = await patch(server, adminAt, '00000000-0000-4000-8000-000000000000', {
      name: 'x',
    });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('self role/isActive change → 409 SELF_CHANGE; self name change → 200', async () => {
    await seedUser(t, 'admin2@x.com', Role.ADMIN);
    for (const body of [
      { role: Role.VIEWER },
      { isActive: false },
      { name: 'n', role: Role.ADMIN },
    ]) {
      const res = await patch(server, adminAt, admin.id, body);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'CONFLICT', details: { reason: 'SELF_CHANGE' } });
    }
    const ok = await patch(server, adminAt, admin.id, { name: '내 이름' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: '내 이름', role: Role.ADMIN, isActive: true });
  });

  // Over HTTP the actor is always an active ADMIN, so the last-admin case is only reachable by a
  // race (next test) — here the service is called directly with an actor that is not an admin.
  it('demoting/deactivating the last active admin → 409 LAST_ADMIN', async () => {
    const users = t.app.get(UsersService);
    await seedUser(t, 'old-admin@x.com', Role.ADMIN, false);
    const outsider = '00000000-0000-4000-8000-000000000001';
    for (const dto of [{ role: Role.MANAGER }, { isActive: false }]) {
      const err = await users.update(outsider, admin.id, dto).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).getStatus()).toBe(409);
      expect((err as AppException).details).toEqual({ reason: 'LAST_ADMIN' });
    }
    expect(await activeAdmins()).toBe(1);
    // Keeping the role/active state (or renaming) is not a demotion.
    await expect(
      users.update(outsider, admin.id, { role: Role.ADMIN, isActive: true, name: 'n' }),
    ).resolves.toMatchObject({ role: Role.ADMIN, isActive: true, name: 'n' });
  });

  it('two admins demote each other concurrently → exactly one 200, one 409; ≥1 active admin remains', async () => {
    const other = await seedUser(t, 'admin2@x.com', Role.ADMIN);
    const otherAt = (await loginCookies(server, 'admin2@x.com')).at;

    // Hold the admin rows so both requests pass auth and then queue on the same lock.
    const blocker = t.dataSource.createQueryRunner();
    await blocker.connect();
    let pending: Promise<[Response, Response]> | undefined;
    try {
      await blocker.startTransaction();
      await blocker.query(`SELECT id FROM users WHERE role = 'ADMIN' FOR UPDATE`);
      pending = Promise.all([
        patch(server, adminAt, other.id, { role: Role.MANAGER }).then((r) => r),
        patch(server, otherAt, admin.id, { role: Role.MANAGER }).then((r) => r),
      ]);
      const deadline = Date.now() + 5000;
      for (;;) {
        const [{ n }] = (await t.dataSource.query(
          `SELECT count(*)::int AS n FROM pg_stat_activity
           WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        )) as [{ n: number }];
        if (n >= 2) break;
        if (Date.now() > deadline)
          throw new Error(`expected 2 requests waiting on the lock, saw ${n}`);
        await new Promise((r) => setTimeout(r, 20));
      }
    } finally {
      if (blocker.isTransactionActive) await blocker.commitTransaction();
      await blocker.release();
    }
    const [r1, r2] = await pending;
    expect([r1.status, r2.status].sort((p, q) => p - q)).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body).toMatchObject({ code: 'CONFLICT', details: { reason: 'LAST_ADMIN' } });
    expect(await activeAdmins()).toBe(1);
  });

  it('deactivate: old access cookie → 401; old refresh → fails; refresh_tokens.revokedAt set', async () => {
    const target = await seedUser(t, 'v@x.com', Role.VIEWER);
    const { at, rt } = await loginCookies(server, 'v@x.com');
    await loginCookies(server, 'v@x.com'); // a second session (another device)
    expect((await request(server).get('/api/v1/auth/me').set('Cookie', at)).status).toBe(200);

    const res = await patch(server, adminAt, target.id, { isActive: false });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: target.id, isActive: false });

    const tokens = (await t.dataSource.query(
      'SELECT "revokedAt" FROM refresh_tokens WHERE "userId" = $1',
      [target.id],
    )) as Array<{ revokedAt: Date | null }>;
    expect(tokens).toHaveLength(2);
    expect(tokens.every((r) => r.revokedAt !== null)).toBe(true);

    expect((await request(server).get('/api/v1/auth/me').set('Cookie', at)).status).toBe(401);
    const refreshed = await request(server)
      .post('/api/v1/auth/refresh')
      .set('X-Requested-With', 'fetch')
      .set('Cookie', rt);
    expect(refreshed.status).toBe(401);
    expect((await login(server, 'v@x.com')).status).toBe(401);
  });

  it('a failed PATCH changes nothing (rolled back)', async () => {
    await seedUser(t, 'admin2@x.com', Role.ADMIN);
    const res = await patch(server, adminAt, admin.id, { name: 'changed', isActive: false });
    expect(res.status).toBe(409);
    const [row] = (await t.dataSource.query('SELECT name, "isActive" FROM users WHERE id = $1', [
      admin.id,
    ])) as Array<{ name: string; isActive: boolean }>;
    expect(row).toEqual({ name: 'admin@x.com-name', isActive: true });
  });

  it('DEMO_MODE=false: demo accounts can be changed normally', async () => {
    const viewer = await seedUser(t, 'viewer@demo.com', Role.VIEWER);
    const res = await patch(server, adminAt, viewer.id, { role: Role.MANAGER, isActive: false });
    expect(res.status).toBe(200);
  });

  it('DEMO_MODE=true: role/isActive change on viewer@demo.com → 403 DEMO_PROTECTED; name change 200; non-demo user 200', async () => {
    const demo = await createTestApp({ env: { DEMO_MODE: 'true' } });
    try {
      const s = demo.app.getHttpServer();
      const demoAdmin = await seedUser(demo, 'admin@demo.com', Role.ADMIN);
      const plainAdmin = await seedUser(demo, 'plain-admin@x.com', Role.ADMIN);
      const viewer = await seedUser(demo, 'viewer@demo.com', Role.VIEWER);
      const other = await seedUser(demo, 'other@x.com', Role.VIEWER);
      const { at } = await loginCookies(s, 'admin@demo.com');

      for (const body of [
        { role: Role.MANAGER },
        { isActive: false },
        { name: 'n', role: Role.ADMIN },
      ]) {
        const res = await patch(s, at, viewer.id, body);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('DEMO_PROTECTED');
      }
      const renamed = await patch(s, at, viewer.id, { name: '데모 뷰어' });
      expect(renamed.status).toBe(200);
      expect(renamed.body).toMatchObject({ name: '데모 뷰어', role: Role.VIEWER, isActive: true });

      const changed = await patch(s, at, other.id, { role: Role.MANAGER, isActive: false });
      expect(changed.status).toBe(200);
      expect(changed.body).toMatchObject({ role: Role.MANAGER, isActive: false });

      // Self role/isActive change is SELF_CHANGE under DEMO_MODE, for demo and non-demo admins.
      for (const body of [{ role: Role.VIEWER }, { isActive: false }]) {
        const demoSelf = await patch(s, at, demoAdmin.id, body);
        expect(demoSelf.status).toBe(409);
        expect(demoSelf.body).toMatchObject({
          code: 'CONFLICT',
          details: { reason: 'SELF_CHANGE' },
        });
      }
      const plainAt = (await loginCookies(s, 'plain-admin@x.com')).at;
      const self = await patch(s, plainAt, plainAdmin.id, { role: Role.VIEWER });
      expect(self.status).toBe(409);
      expect(self.body.details).toEqual({ reason: 'SELF_CHANGE' });
    } finally {
      await demo.stop();
    }
  });
});
