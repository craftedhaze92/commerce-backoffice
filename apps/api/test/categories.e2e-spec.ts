import request from 'supertest';
import { Role } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { Category } from '../src/categories/category.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const NAMES = ['의류', '식품', '가전', '도서', '완구', '뷰티', '스포츠', '가구'];

describe('categories (e2e)', () => {
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
    await t.dataSource.query('TRUNCATE users, categories CASCADE');
    await t.dataSource.getRepository(Category).save(NAMES.map((name) => ({ name })));
    const repo = t.dataSource.getRepository(User);
    await repo.save(
      repo.create({
        email: 'viewer@demo.com',
        name: 'viewer',
        role: Role.VIEWER,
        passwordHash: await hashPassword(PW),
      }),
    );
  });

  const viewerCookie = async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'viewer@demo.com', password: PW });
    const raw = res.headers['set-cookie'] as unknown as string[];
    return raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
  };

  it('GET /categories without cookie -> 401', async () => {
    const res = await request(server).get('/api/v1/categories');
    expect(res.status).toBe(401);
  });

  it('GET /categories as viewer -> 8 sorted by name', async () => {
    const res = await request(server)
      .get('/api/v1/categories')
      .set('Cookie', await viewerCookie());
    expect(res.status).toBe(200);
    const body = res.body as { id: string; name: string }[];
    expect(body.map((c) => c.name)).toEqual([...NAMES].sort((a, b) => (a < b ? -1 : 1)));
    expect(Object.keys(body[0]!).sort()).toEqual(['id', 'name']);
  });
});
