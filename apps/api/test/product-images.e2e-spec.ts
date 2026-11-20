import request, { type Response } from 'supertest';
import { Role } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { fakePngText, pngOf } from './fixtures/images.js';
import { hashPassword } from '../src/auth/password.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/products/images';

describe('product images (e2e)', () => {
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
    await t.dataSource.query('TRUNCATE users, product_images CASCADE');
    const passwordHash = await hashPassword(PW);
    const repo = t.dataSource.getRepository(User);
    await repo.save(
      (['manager', 'viewer'] as const).map((r) =>
        repo.create({
          email: `${r}@demo.com`,
          name: r,
          role: r.toUpperCase() as Role,
          passwordHash,
        }),
      ),
    );
  });

  const loginAs = async (name: string) => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: `${name}@demo.com`, password: PW });
    const raw = res.headers['set-cookie'] as unknown as string[];
    return raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
  };
  const upload = (cookie: string, file: Buffer, csrf = true): Promise<Response> => {
    const req = request(server).post(URL).set('Cookie', cookie);
    if (csrf) req.set('X-Requested-With', 'fetch');
    return req.attach('file', file, 'a.png') as unknown as Promise<Response>;
  };
  const rows = async () =>
    Number((await t.dataSource.query('SELECT count(*) FROM product_images'))[0].count);

  it('manager uploads png -> 201 ProductImage with /media urls that exist in s3', async () => {
    const res = await upload(await loginAs('manager'), await pngOf(2000, 1000));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      width: 1600,
      height: 800,
      sortOrder: 0,
      isPrimary: false,
    });
    expect(res.body.url).toMatch(/^\/media\/products\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
    expect(res.body.thumbUrl).toMatch(
      /^\/media\/products\/\d{4}\/\d{2}\/[0-9a-f-]{36}_thumb\.webp$/,
    );
    for (const u of [res.body.url, res.body.thumbUrl] as string[]) {
      const obj = await fetch(`${t.s3.endpoint}/${t.s3.bucket}/${u.replace('/media/', '')}`);
      expect(obj.status).toBe(200);
      expect(obj.headers.get('content-type')).toBe('image/webp');
    }
  });

  it('viewer -> 403', async () => {
    const res = await upload(await loginAs('viewer'), await pngOf(10, 10));
    expect(res.status).toBe(403);
  });

  it('missing file -> 400 VALIDATION_FAILED field file', async () => {
    const res = await request(server)
      .post(URL)
      .set('Cookie', await loginAs('manager'))
      .set('X-Requested-With', 'fetch');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'file', messages: [expect.any(String)] }],
    });
  });

  it('6MB file -> 413 and nothing stored', async () => {
    const res = await upload(await loginAs('manager'), Buffer.alloc(6 * 1024 * 1024, 1));
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ statusCode: 413, code: 'VALIDATION_FAILED' });
    expect(await rows()).toBe(0);
  });

  it('fake png -> 400 and nothing stored', async () => {
    const res = await upload(await loginAs('manager'), fakePngText());
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(await rows()).toBe(0);
  });

  it('without X-Requested-With -> 403 CSRF_REQUIRED', async () => {
    const res = await upload(await loginAs('manager'), await pngOf(10, 10), false);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REQUIRED');
  });
});
