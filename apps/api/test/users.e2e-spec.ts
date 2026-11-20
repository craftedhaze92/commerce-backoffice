import { QueryFailedError, type Repository } from 'typeorm';
import { Role } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { User } from '../src/users/user.entity.js';
import { UsersService } from '../src/users/users.service.js';

describe('users (e2e)', () => {
  let t: TestApp;
  let repo: Repository<User>;
  let users: UsersService;

  beforeAll(async () => {
    t = await createTestApp();
    repo = t.dataSource.getRepository(User);
    users = t.app.get(UsersService);
  });

  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    await repo.clear();
  });

  const make = (email: string, name = 'n') =>
    repo.save(repo.create({ email, passwordHash: 'h', name }));

  it('defaults role VIEWER and isActive true', async () => {
    const u = await make('a@x.com');
    expect(u.role).toBe(Role.VIEWER);
    expect(u.isActive).toBe(true);
  });

  it('findByEmail is case-insensitive via normalize', async () => {
    const u = await make('admin@demo.com');
    expect((await users.findByEmail('  Admin@Demo.COM '))?.id).toBe(u.id);
    expect(await users.findByEmail('none@demo.com')).toBeNull();
  });

  it('findById returns the user or null', async () => {
    const u = await make('b@x.com');
    expect((await users.findById(u.id))?.email).toBe('b@x.com');
    expect(await users.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('email unique violation', async () => {
    await make('dup@x.com');
    const err = await make('dup@x.com').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QueryFailedError);
    expect((err as QueryFailedError & { driverError: { code: string } }).driverError.code).toBe(
      '23505',
    );
  });

  it('list paginates createdAt DESC and maps to UserListItem', async () => {
    for (const n of ['1', '2', '3']) await make(`u${n}@x.com`, `user${n}`);
    const p1 = await users.list(1, 2);
    expect(p1.meta).toEqual({ page: 1, size: 2, total: 3, totalPages: 2 });
    expect(p1.items.map((i) => i.email)).toEqual(['u3@x.com', 'u2@x.com']);
    expect(Object.keys(p1.items[0]!).sort()).toEqual(
      ['createdAt', 'email', 'id', 'isActive', 'name', 'role'].sort(),
    );
    expect(typeof p1.items[0]!.createdAt).toBe('string');
    const p2 = await users.list(2, 2);
    expect(p2.items.map((i) => i.email)).toEqual(['u1@x.com']);
  });

  it('list on empty table has totalPages 0', async () => {
    expect((await users.list(1, 10)).meta).toEqual({ page: 1, size: 10, total: 0, totalPages: 0 });
  });
});
