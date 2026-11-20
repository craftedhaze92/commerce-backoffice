import request from 'supertest';
import { ProductStatus, Role, type Paginated, type ProductListItem } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/auth/password.js';
import { Category } from '../src/categories/category.entity.js';
import { Inventory } from '../src/products/inventory.entity.js';
import { ProductImage } from '../src/products/product-image.entity.js';
import { Product } from '../src/products/product.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';

describe('products list + detail (e2e)', () => {
  let t: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;
  let cat: { a: string; b: string };
  let cookie: string;

  beforeAll(async () => {
    t = await createTestApp();
    server = t.app.getHttpServer();
  });

  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    const ds = t.dataSource;
    await ds.query('TRUNCATE users, products, categories RESTART IDENTITY CASCADE');
    const cats = await ds.getRepository(Category).save([{ name: '의류' }, { name: '식품' }]);
    cat = { a: cats[0]!.id, b: cats[1]!.id };
    const users = ds.getRepository(User);
    await users.save(
      users.create({
        email: 'viewer@demo.com',
        name: 'viewer',
        role: Role.VIEWER,
        passwordHash: await hashPassword(PW),
      }),
    );
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'viewer@demo.com', password: PW });
    const raw = res.headers['set-cookie'] as unknown as string[];
    cookie = raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
  });

  interface Opts {
    sku: string;
    name?: string;
    categoryId?: string;
    price?: number;
    status?: ProductStatus;
    quantity?: number;
    safetyStock?: number;
    createdAt?: Date;
    deleted?: boolean;
  }
  const make = (o: Opts) =>
    t.dataSource.transaction(async (m) => {
      const p = await m.save(
        m.create(Product, {
          sku: o.sku,
          name: o.name ?? o.sku,
          categoryId: o.categoryId ?? cat.a,
          price: o.price ?? 1000,
          status: o.status ?? ProductStatus.ON_SALE,
          ...(o.createdAt ? { createdAt: o.createdAt } : {}),
        }),
      );
      await m.save(
        m.create(Inventory, {
          productId: p.id,
          quantity: o.quantity ?? 10,
          safetyStock: o.safetyStock ?? 0,
        }),
      );
      if (o.deleted) await m.softRemove(p);
      return p;
    });

  const list = (qs = '') => request(server).get(`/api/v1/products${qs}`).set('Cookie', cookie);
  const skus = (res: request.Response) =>
    (res.body as Paginated<ProductListItem>).items.map((i) => i.sku);

  it('GET /products without cookie -> 401', async () => {
    expect((await request(server).get('/api/v1/products')).status).toBe(401);
  });

  it('default sort createdAt desc, size 20, meta.total = live products only', async () => {
    for (let i = 1; i <= 22; i++) {
      await make({ sku: `SKU-${String(i).padStart(3, '0')}`, createdAt: new Date(2026, 0, i) });
    }
    await make({ sku: 'GONE-1', deleted: true });
    const res = await list();
    expect(res.status).toBe(200);
    const body = res.body as Paginated<ProductListItem>;
    expect(body.meta).toEqual({ page: 1, size: 20, total: 22, totalPages: 2 });
    expect(body.items).toHaveLength(20);
    expect(body.items[0]!.sku).toBe('SKU-022');
    expect(body.items[19]!.sku).toBe('SKU-003');
    const page2 = await list('?page=2');
    expect(skus(page2)).toEqual(['SKU-002', 'SKU-001']);
  });

  it('maps list item fields', async () => {
    const p = await make({ sku: 'SKU-001', name: '티셔츠', quantity: 3, safetyStock: 5 });
    await t.dataSource.getRepository(ProductImage).save([
      { productId: p.id, objectKey: 'k/2', thumbKey: 'k/2-t', width: 1, height: 1, sortOrder: 1 },
      {
        productId: p.id,
        objectKey: 'k/1',
        thumbKey: 'k/1-t',
        width: 1,
        height: 1,
        sortOrder: 0,
        isPrimary: true,
      },
    ]);
    await make({ sku: 'SKU-002' });
    const res = await list('?sort=name:asc&q=SKU-00');
    const items = (res.body as Paginated<ProductListItem>).items;
    expect(items).toHaveLength(2);
    const first = items.find((i) => i.sku === 'SKU-001')!;
    expect(first).toMatchObject({
      id: p.id,
      name: '티셔츠',
      categoryId: cat.a,
      categoryName: '의류',
      price: 1000,
      status: 'ON_SALE',
      stock: 3,
      safetyStock: 5,
      isLowStock: true,
      thumbUrl: '/media/k/1-t',
    });
    expect(typeof first.createdAt).toBe('string');
    expect(items.find((i) => i.sku === 'SKU-002')!.thumbUrl).toBeNull();
  });

  it('filters: categoryId, status, minPrice/maxPrice, lowStock', async () => {
    await make({ sku: 'A-1', categoryId: cat.a, price: 100, status: ProductStatus.ON_SALE });
    await make({ sku: 'A-2', categoryId: cat.a, price: 500, status: ProductStatus.DRAFT });
    await make({
      sku: 'B-1',
      categoryId: cat.b,
      price: 900,
      status: ProductStatus.ON_SALE,
      quantity: 2,
      safetyStock: 2,
    });
    await make({ sku: 'B-2', categoryId: cat.b, price: 300, quantity: 3, safetyStock: 2 });
    const sorted = async (qs: string) => skus(await list(`?sort=price:asc&${qs}`)).sort();
    expect(await sorted(`categoryId=${cat.b}`)).toEqual(['B-1', 'B-2']);
    expect(await sorted('status=ON_SALE')).toEqual(['A-1', 'B-1', 'B-2']);
    expect(await sorted('status=DRAFT')).toEqual(['A-2']);
    expect(await sorted('minPrice=300&maxPrice=500')).toEqual(['A-2', 'B-2']);
    expect(await sorted('minPrice=900')).toEqual(['B-1']);
    expect(await sorted('maxPrice=100')).toEqual(['A-1']);
    expect(await sorted('lowStock=true')).toEqual(['B-1']);
    expect(await sorted('lowStock=false')).toEqual(['A-1', 'A-2', 'B-1', 'B-2']);
    expect(await sorted(`categoryId=${cat.b}&status=ON_SALE&lowStock=true`)).toEqual(['B-1']);
  });

  it('q matches name or sku, case-insensitive', async () => {
    await make({ sku: 'SHIRT-1', name: '린넨 셔츠' });
    await make({ sku: 'PANTS-1', name: 'Cotton Shirt' });
    await make({ sku: 'HAT-1', name: '모자' });
    expect(skus(await list('?q=shirt')).sort()).toEqual(['PANTS-1', 'SHIRT-1']);
    expect(skus(await list('?q=린넨'))).toEqual(['SHIRT-1']);
    expect(skus(await list('?q=hat-1'))).toEqual(['HAT-1']);
    expect(skus(await list('?q=%20%20'))).toHaveLength(3);
  });

  it('q treats % and _ literally', async () => {
    await make({ sku: 'SKU-1', name: 'A_B' });
    await make({ sku: 'SKU-2', name: 'AXB' });
    await make({ sku: 'SKU-3', name: '50%할인' });
    await make({ sku: 'SKU-4', name: 'back\\slash' });
    expect(skus(await list('?q=_'))).toEqual(['SKU-1']);
    expect(skus(await list(`?q=${encodeURIComponent('50%')}`))).toEqual(['SKU-3']);
    expect(skus(await list(`?q=${encodeURIComponent('\\')}`))).toEqual(['SKU-4']);
  });

  it.each([
    'sort=password:asc',
    'status=FOO',
    'minPrice=-1',
    'minPrice=500&maxPrice=100',
    'size=101',
    'categoryId=x',
    'lowStock=yes',
    `q=${'a'.repeat(51)}`,
    'foo=1',
  ])('GET /products?%s -> 400 VALIDATION_FAILED', async (qs) => {
    const res = await list(`?${qs}`);
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe('VALIDATION_FAILED');
  });

  it('minPrice > maxPrice reports details on minPrice', async () => {
    const res = await list('?minPrice=500&maxPrice=100');
    expect((res.body as { details: unknown }).details).toEqual([
      { field: 'minPrice', messages: ['minPrice must be ≤ maxPrice'] },
    ]);
  });

  it('sort=stock:asc orders by inventory quantity then id', async () => {
    await make({ sku: 'S-3', quantity: 5 });
    await make({ sku: 'S-1', quantity: 1 });
    await make({ sku: 'S-2', quantity: 5 });
    const asc = (await list('?sort=stock:asc')).body as Paginated<ProductListItem>;
    expect(asc.items.map((i) => i.stock)).toEqual([1, 5, 5]);
    const ids = asc.items.slice(1).map((i) => i.id);
    expect(ids).toEqual([...ids].sort());
    const desc = (await list('?sort=stock:desc')).body as Paginated<ProductListItem>;
    expect(desc.items.map((i) => i.stock)).toEqual([5, 5, 1]);
  });

  it('GET /products/:id returns detail with images ordered by sortOrder', async () => {
    const p = await make({ sku: 'D-1', name: '상세' });
    await t.dataSource.query('UPDATE products SET description = $1 WHERE id = $2', ['설명', p.id]);
    const imgs = t.dataSource.getRepository(ProductImage);
    await imgs.save([
      { productId: p.id, objectKey: 'k/b', thumbKey: 'k/b-t', width: 20, height: 10, sortOrder: 1 },
      {
        productId: p.id,
        objectKey: 'k/a',
        thumbKey: 'k/a-t',
        width: 30,
        height: 15,
        sortOrder: 0,
        isPrimary: true,
      },
    ]);
    const res = await request(server).get(`/api/v1/products/${p.id}`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    const body = res.body as {
      description: string;
      thumbUrl: string;
      images: { url: string; thumbUrl: string; sortOrder: number; isPrimary: boolean }[];
    };
    expect(body).toMatchObject({ id: p.id, sku: 'D-1', description: '설명', categoryName: '의류' });
    expect(body.thumbUrl).toBe('/media/k/a-t');
    expect(body.images.map((i) => i.url)).toEqual(['/media/k/a', '/media/k/b']);
    expect(body.images[0]).toMatchObject({
      thumbUrl: '/media/k/a-t',
      width: 30,
      height: 15,
      sortOrder: 0,
      isPrimary: true,
    });
  });

  it('GET /products/:id for soft-deleted or unknown -> 404 NOT_FOUND', async () => {
    const p = await make({ sku: 'D-2', deleted: true });
    for (const id of [p.id, '00000000-0000-4000-8000-000000000000']) {
      const res = await request(server).get(`/api/v1/products/${id}`).set('Cookie', cookie);
      expect(res.status).toBe(404);
      expect((res.body as { code: string }).code).toBe('NOT_FOUND');
    }
  });

  it('GET /products/:id with non-uuid -> 400', async () => {
    const res = await request(server).get('/api/v1/products/nope').set('Cookie', cookie);
    expect(res.status).toBe(400);
  });
});
