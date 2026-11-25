import request from 'supertest';
import { ProductStatus, Role, type ProductDetail } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { Category } from '../src/categories/category.entity.js';
import { Inventory } from '../src/products/inventory.entity.js';
import { ProductImage } from '../src/products/product-image.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/products';

describe('products write (e2e)', () => {
  let t: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;
  let catId: string;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    server = t.app.getHttpServer();
  });
  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    const ds = t.dataSource;
    await ds.query('TRUNCATE users, products, categories, product_images RESTART IDENTITY CASCADE');
    catId = (await ds.getRepository(Category).save({ name: '의류' })).id;
    const users = ds.getRepository(User);
    const passwordHash = await hashPassword(PW);
    await users.save(
      (['manager', 'viewer'] as const).map((r) =>
        users.create({
          email: `${r}@demo.com`,
          name: r,
          role: r.toUpperCase() as Role,
          passwordHash,
        }),
      ),
    );
    for (const r of ['manager', 'viewer']) {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('X-Requested-With', 'fetch')
        .send({ email: `${r}@demo.com`, password: PW });
      const raw = res.headers['set-cookie'] as unknown as string[];
      cookies[r] = raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
    }
  });

  const newImage = async (productId: string | null = null) =>
    (
      await t.dataSource.getRepository(ProductImage).save({
        productId,
        objectKey: `k/${Math.random()}`,
        thumbKey: `k/${Math.random()}-t`,
        width: 10,
        height: 10,
      })
    ).id;
  const body = (o: Record<string, unknown> = {}) => ({
    sku: 'SKU-0001',
    name: '티셔츠',
    categoryId: catId,
    price: 1000,
    status: ProductStatus.ON_SALE,
    initialStock: 7,
    safetyStock: 2,
    images: [],
    ...o,
  });
  const post = (b: unknown, who = 'manager') =>
    request(server)
      .post(URL)
      .set('Cookie', cookies[who]!)
      .set('X-Requested-With', 'fetch')
      .send(b as object);
  const patch = (id: string, b: unknown) =>
    request(server)
      .patch(`${URL}/${id}`)
      .set('Cookie', cookies.manager!)
      .set('X-Requested-With', 'fetch')
      .send(b as object);
  const del = (id: string) =>
    request(server)
      .delete(`${URL}/${id}`)
      .set('Cookie', cookies.manager!)
      .set('X-Requested-With', 'fetch');
  const get = (id: string) => request(server).get(`${URL}/${id}`).set('Cookie', cookies.manager!);
  const count = async (table: string) =>
    Number((await t.dataSource.query(`SELECT count(*) FROM ${table}`))[0].count);

  it('manager creates product with 2 images -> 201 detail', async () => {
    const [a, b] = [await newImage(), await newImage()];
    const res = await post(
      body({
        images: [
          { id: a, isPrimary: false },
          { id: b, isPrimary: true },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const d = res.body as ProductDetail;
    expect(d).toMatchObject({ sku: 'SKU-0001', stock: 7, safetyStock: 2, description: '' });
    expect(d.images.map((i) => i.id)).toEqual([a, b]);
    expect(d.images.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(d.images.map((i) => i.isPrimary)).toEqual([false, true]);
    expect(d.thumbUrl).toBe(d.images[1]!.thumbUrl);
  });

  it('viewer POST -> 403; no X-Requested-With -> 403 CSRF_REQUIRED', async () => {
    expect((await post(body(), 'viewer')).status).toBe(403);
    const res = await request(server).post(URL).set('Cookie', cookies.manager!).send(body());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REQUIRED');
  });

  it.each(['patch', 'delete'] as const)('viewer %s -> 403 and product unchanged', async (verb) => {
    const created = await post(body());
    const id = (created.body as ProductDetail).id;
    const req = request(server)
      [verb](`${URL}/${id}`)
      .set('Cookie', cookies.viewer!)
      .set('X-Requested-With', 'fetch');
    const res = await (verb === 'patch' ? req.send({ name: '변경' }) : req);
    expect(res.status).toBe(403);
    const after = await get(id);
    expect(after.status).toBe(200);
    expect(after.body.name).toBe('티셔츠');
  });

  it('PATCH without X-Requested-With -> 403 CSRF_REQUIRED', async () => {
    const id = ((await post(body())).body as ProductDetail).id;
    const res = await request(server)
      .patch(`${URL}/${id}`)
      .set('Cookie', cookies.manager!)
      .send({ name: '변경' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REQUIRED');
  });

  it('duplicate sku (" sku-0001 " vs existing SKU-0001) -> 409 CONFLICT details {field:"sku"}', async () => {
    expect((await post(body())).status).toBe(201);
    const res = await post(body({ sku: ' sku-0001 ' }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CONFLICT', details: { field: 'sku' } });
    expect(await count('products')).toBe(1);
  });

  it('sku of soft-deleted product can be reused -> 201', async () => {
    const first = await post(body());
    expect((await del(first.body.id)).status).toBe(204);
    expect((await post(body())).status).toBe(201);
  });

  it.each([
    'image attached to another product',
    'unknown image id',
    'two primaries',
    '11 images',
    'duplicate image id',
    'images but no primary',
  ])('invalid images (%s) -> 400 field images and nothing persisted', async (kind) => {
    const other = (await post(body({ sku: 'OTHER-1' }))).body.id as string;
    const attached = await newImage(other);
    const free = await newImage();
    const free2 = await newImage();
    const images = (
      {
        'image attached to another product': [{ id: attached, isPrimary: true }],
        'unknown image id': [{ id: '11111111-1111-4111-8111-111111111111', isPrimary: true }],
        'two primaries': [
          { id: free, isPrimary: true },
          { id: free2, isPrimary: true },
        ],
        '11 images': Array.from({ length: 11 }, () => ({ id: free, isPrimary: false })),
        'duplicate image id': [
          { id: free, isPrimary: true },
          { id: free, isPrimary: false },
        ],
        'images but no primary': [{ id: free, isPrimary: false }],
      } as Record<string, unknown[]>
    )[kind];
    const before = { p: await count('products'), i: await count('inventories') };
    const res = await post(body({ images }));
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('images');
    expect(await count('products')).toBe(before.p);
    expect(await count('inventories')).toBe(before.i);
    const row = await t.dataSource.getRepository(ProductImage).findOneByOrFail({ id: attached });
    expect(row.productId).toBe(other);
    const f = await t.dataSource.getRepository(ProductImage).findOneByOrFail({ id: free });
    expect(f.productId).toBeNull();
  });

  it('unknown categoryId -> 400 field categoryId', async () => {
    const res = await post(body({ categoryId: '11111111-1111-4111-8111-111111111111' }));
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('categoryId');
    expect(await count('products')).toBe(0);
  });

  it('validation: price -1, name "", sku "ab", initialStock 1.5 -> 400 VALIDATION_FAILED', async () => {
    const res = await post(body({ price: -1, name: '', sku: 'ab', initialStock: 1.5 }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const fields = (res.body.details as { field: string }[]).map((d) => d.field).sort();
    expect(fields).toEqual(['initialStock', 'name', 'price', 'sku']);
  });

  it('PATCH partial updates name only; updatedAt changes; stock unchanged', async () => {
    const created = (await post(body())).body as ProductDetail;
    await new Promise((r) => setTimeout(r, 15));
    const res = await patch(created.id, { name: '새 이름' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: '새 이름', stock: 7, sku: 'SKU-0001', price: 1000 });
    expect(res.body.updatedAt).not.toBe(created.updatedAt);
  });

  it.each(['sku', 'name', 'categoryId', 'price', 'status', 'safetyStock', 'images', 'description'])(
    'PATCH {"%s": null} -> 400 VALIDATION_FAILED and nothing changes',
    async (field) => {
      const created = (await post(body())).body as ProductDetail;
      const res = await patch(created.id, { [field]: null });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect((res.body.details as { field: string }[]).map((d) => d.field)).toContain(field);
      expect((await get(created.id)).body).toEqual(created);
    },
  );

  it('PATCH images replaces set; removed image becomes unattached; no images leaves them', async () => {
    const [a, b, c] = [await newImage(), await newImage(), await newImage()];
    const created = (
      await post(
        body({
          images: [
            { id: a, isPrimary: true },
            { id: b, isPrimary: false },
          ],
        }),
      )
    ).body as ProductDetail;
    const untouched = await patch(created.id, { name: 'x' });
    expect(untouched.body.images.map((i: { id: string }) => i.id)).toEqual([a, b]);
    const res = await patch(created.id, {
      images: [
        { id: c, isPrimary: false },
        { id: b, isPrimary: true },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.images.map((i: { id: string }) => i.id)).toEqual([c, b]);
    expect(res.body.images.map((i: { isPrimary: boolean }) => i.isPrimary)).toEqual([false, true]);
    const removed = await t.dataSource.getRepository(ProductImage).findOneByOrFail({ id: a });
    expect(removed).toMatchObject({ productId: null, isPrimary: false, sortOrder: 0 });
  });

  it('PATCH safetyStock updates inventory and isLowStock', async () => {
    const created = (await post(body())).body as ProductDetail;
    expect(created.isLowStock).toBe(false);
    const res = await patch(created.id, { safetyStock: 7 });
    expect(res.body).toMatchObject({ safetyStock: 7, stock: 7, isLowStock: true });
    const inv = await t.dataSource
      .getRepository(Inventory)
      .findOneByOrFail({ productId: created.id });
    expect(inv.safetyStock).toBe(7);
  });

  it('PATCH sku change is normalized and conflicts map to 409; unknown id -> 404', async () => {
    await post(body({ sku: 'AAA-1' }));
    const b = (await post(body({ sku: 'BBB-1' }))).body as ProductDetail;
    expect((await patch(b.id, { sku: ' aaa-1' })).status).toBe(409);
    expect((await patch(b.id, { sku: ' ccc-1' })).body.sku).toBe('CCC-1');
    expect((await patch('11111111-1111-4111-8111-111111111111', { name: 'x' })).status).toBe(404);
  });

  it('DELETE -> 204, then GET -> 404, list excludes it; DELETE again -> 404', async () => {
    const created = (await post(body())).body as ProductDetail;
    expect((await del(created.id)).status).toBe(204);
    expect((await get(created.id)).status).toBe(404);
    const list = await request(server).get(URL).set('Cookie', cookies.manager!);
    expect(list.body.items).toHaveLength(0);
    expect((await del(created.id)).status).toBe(404);
    expect((await patch(created.id, { name: 'x' })).status).toBe(404);
    expect((await del('11111111-1111-4111-8111-111111111111')).status).toBe(404);
  });

  it('two concurrent creates attaching the same unattached image -> exactly one 201, other 400', async () => {
    const img = await newImage();
    const images = [{ id: img, isPrimary: true }];
    const [r1, r2] = await Promise.all([
      post(body({ sku: 'RACE-1', images })),
      post(body({ sku: 'RACE-2', images })),
    ]);
    expect([r1.status, r2.status].sort((a, b) => a - b)).toEqual([201, 400]);
    expect(await count('products')).toBe(1);
    expect(await count('inventories')).toBe(1);
  });
});
