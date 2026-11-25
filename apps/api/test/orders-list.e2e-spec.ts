import request from 'supertest';
import {
  OrderStatus,
  Role,
  type OrderDetail,
  type OrderListItem,
  type Paginated,
} from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/orders';

describe('orders list/detail (e2e)', () => {
  let t: TestApp;
  let cookies: Record<string, string>;
  let managerId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.stop();
  });

  async function insertOrder(o: {
    no: string;
    customer?: string;
    status?: OrderStatus;
    total?: number;
    createdAt: string;
  }): Promise<string> {
    const rows = (await t.dataSource.query(
      `INSERT INTO orders ("orderNo","customerName",status,"totalAmount","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`,
      [o.no, o.customer ?? '홍길동', o.status ?? 'PENDING', o.total ?? 1000, o.createdAt],
    )) as Array<{ id: string }>;
    return rows[0]!.id;
  }

  beforeEach(async () => {
    const ds = t.dataSource;
    await ds.query(
      'TRUNCATE users, products, categories, orders, order_sequences RESTART IDENTITY CASCADE',
    );
    const users = ds.getRepository(User);
    const passwordHash = await hashPassword(PW);
    const saved = await users.save(
      (['manager', 'viewer'] as const).map((r) =>
        users.create({
          email: `${r}@demo.com`,
          name: `${r}-name`,
          role: r.toUpperCase() as Role,
          passwordHash,
        }),
      ),
    );
    managerId = saved[0]!.id;
    cookies = {};
    for (const r of ['manager', 'viewer']) {
      const res = await request(t.app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Requested-With', 'fetch')
        .send({ email: `${r}@demo.com`, password: PW });
      const raw = res.headers['set-cookie'] as unknown as string[];
      cookies[r] = raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
    }
  });

  const get = (path: string, who = 'manager') =>
    request(t.app.getHttpServer()).get(path).set('Cookie', cookies[who]!);
  const list = async (qs = '') => (await get(`${URL}${qs}`)).body as Paginated<OrderListItem>;

  it('default createdAt desc with id tiebreak; meta.total', async () => {
    const same = '2026-11-10T00:00:00Z';
    const a = await insertOrder({ no: 'ORD-A', createdAt: '2026-11-01T00:00:00Z' });
    const b = await insertOrder({ no: 'ORD-B', createdAt: same });
    const c = await insertOrder({ no: 'ORD-C', createdAt: same });
    const body = await list();
    expect(body.meta).toEqual({ page: 1, size: 20, total: 3, totalPages: 1 });
    const tied = [b, c].sort();
    expect(body.items.map((i) => i.id)).toEqual([...tied, a]);
    expect(body.items[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const p2 = await list('?page=2&size=2');
    expect(p2.items).toHaveLength(1);
    expect(p2.meta).toEqual({ page: 2, size: 2, total: 3, totalPages: 2 });
  });

  it('itemCount counts item rows', async () => {
    const id = await insertOrder({ no: 'ORD-I', createdAt: '2026-11-01T00:00:00Z' });
    const cat = (await t.dataSource.query(
      `INSERT INTO categories (name) VALUES ('c') RETURNING id`,
    )) as Array<{ id: string }>;
    for (const sku of ['S1', 'S2']) {
      const p = (await t.dataSource.query(
        `INSERT INTO products (sku,name,"categoryId",price,status,description) VALUES ($1,'n',$2,100,'ON_SALE','') RETURNING id`,
        [sku, cat[0]!.id],
      )) as Array<{ id: string }>;
      await t.dataSource.query(
        `INSERT INTO order_items ("orderId","productId",sku,"productName",quantity,"unitPrice") VALUES ($1,$2,$3,'n',2,100)`,
        [id, p[0]!.id, sku],
      );
    }
    const body = await list();
    expect(body.items[0]!.itemCount).toBe(2);
  });

  it('status filter', async () => {
    await insertOrder({ no: 'ORD-1', createdAt: '2026-11-01T00:00:00Z' });
    await insertOrder({
      no: 'ORD-2',
      status: OrderStatus.CONFIRMED,
      createdAt: '2026-11-02T00:00:00Z',
    });
    const body = await list('?status=CONFIRMED');
    expect(body.items.map((i) => i.orderNo)).toEqual(['ORD-2']);
    expect(body.meta.total).toBe(1);
  });

  it('KST boundary: to=2026-11-20 includes 23:59 KST, excludes next 00:00 KST', async () => {
    await insertOrder({ no: 'ORD-BEFORE', createdAt: '2026-11-19T23:59:59+09:00' });
    await insertOrder({ no: 'ORD-START', createdAt: '2026-11-20T00:00:00+09:00' });
    await insertOrder({ no: 'ORD-END', createdAt: '2026-11-20T23:59:59+09:00' });
    await insertOrder({ no: 'ORD-NEXT', createdAt: '2026-11-21T00:00:00+09:00' });
    const body = await list('?from=2026-11-20&to=2026-11-20&sort=createdAt:asc');
    expect(body.items.map((i) => i.orderNo)).toEqual(['ORD-START', 'ORD-END']);
    expect((await list('?from=2026-11-20&sort=createdAt:asc')).meta.total).toBe(3);
    expect((await list('?to=2026-11-20')).meta.total).toBe(3);
  });

  it('q matches orderNo and customerName; % and _ literal', async () => {
    await insertOrder({
      no: 'ORD-20261120-0001',
      customer: '김철수',
      createdAt: '2026-11-01T00:00:00Z',
    });
    await insertOrder({ no: 'ORD-X', customer: '100%_할인', createdAt: '2026-11-02T00:00:00Z' });
    await insertOrder({ no: 'ORD-Y', customer: '1000a할인', createdAt: '2026-11-03T00:00:00Z' });
    expect((await list('?q=0001')).items.map((i) => i.orderNo)).toEqual(['ORD-20261120-0001']);
    expect((await list(`?q=${encodeURIComponent('김철')}`)).meta.total).toBe(1);
    expect((await list('?q=ord-x')).meta.total).toBe(1);
    expect((await list(`?q=${encodeURIComponent('%')}`)).items.map((i) => i.orderNo)).toEqual([
      'ORD-X',
    ]);
    expect((await list(`?q=${encodeURIComponent('%_')}`)).items.map((i) => i.orderNo)).toEqual([
      'ORD-X',
    ]);
    expect((await list('?q=%20%20')).meta.total).toBe(3);
  });

  it('sort totalAmount:asc', async () => {
    await insertOrder({ no: 'ORD-1', total: 3000, createdAt: '2026-11-01T00:00:00Z' });
    await insertOrder({ no: 'ORD-2', total: 1000, createdAt: '2026-11-02T00:00:00Z' });
    await insertOrder({ no: 'ORD-3', total: 2000, createdAt: '2026-11-03T00:00:00Z' });
    expect((await list('?sort=totalAmount:asc')).items.map((i) => i.totalAmount)).toEqual([
      1000, 2000, 3000,
    ]);
    expect((await list('?sort=totalAmount:desc')).items.map((i) => i.totalAmount)).toEqual([
      3000, 2000, 1000,
    ]);
  });

  it.each([
    'sort=foo:asc',
    'status=X',
    'from=2026-11-21&to=2026-11-20',
    'from=2026-02-30',
    'to=20261120',
    'q=' + 'x'.repeat(51),
    'size=0',
  ])('400 for %s', async (qs) => {
    const res = await get(`${URL}?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('detail: items with snapshots + subtotal, history ordered with actorName', async () => {
    const id = await insertOrder({
      no: 'ORD-D',
      total: 700,
      status: OrderStatus.CONFIRMED,
      createdAt: '2026-11-01T00:00:00Z',
    });
    const cat = (await t.dataSource.query(
      `INSERT INTO categories (name) VALUES ('c') RETURNING id`,
    )) as Array<{ id: string }>;
    for (const [sku, qty, price] of [
      ['B-2', 1, 300],
      ['A-1', 2, 200],
    ] as const) {
      const p = (await t.dataSource.query(
        `INSERT INTO products (sku,name,"categoryId",price,status,description) VALUES ($1,'cur',$2,9999,'ON_SALE','') RETURNING id`,
        [sku, cat[0]!.id],
      )) as Array<{ id: string }>;
      await t.dataSource.query(
        `INSERT INTO order_items ("orderId","productId",sku,"productName",quantity,"unitPrice") VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, p[0]!.id, sku, `snap-${sku}`, qty, price],
      );
    }
    await t.dataSource.query(
      `INSERT INTO order_status_histories ("orderId","fromStatus","toStatus","actorId","createdAt") VALUES
       ($1,'PENDING','CONFIRMED',$2,'2026-11-01T02:00:00Z'),
       ($1,NULL,'PENDING',$2,'2026-11-01T01:00:00Z'),
       ($1,'CONFIRMED','SHIPPED',NULL,'2026-11-01T03:00:00Z')`,
      [id, managerId],
    );
    const res = await get(`${URL}/${id}`);
    expect(res.status).toBe(200);
    const d = res.body as OrderDetail;
    expect(d.orderNo).toBe('ORD-D');
    expect(d.itemCount).toBe(2);
    expect(d.confirmedAt).toBeNull();
    expect(d.items.map((i) => i.sku)).toEqual(['A-1', 'B-2']);
    expect(d.items[0]).toMatchObject({
      productName: 'snap-A-1',
      quantity: 2,
      unitPrice: 200,
      subtotal: 400,
    });
    expect(d.items[1]!.subtotal).toBe(300);
    expect(d.history.map((h) => [h.fromStatus, h.toStatus, h.actorName])).toEqual([
      [null, 'PENDING', 'manager-name'],
      ['PENDING', 'CONFIRMED', 'manager-name'],
      ['CONFIRMED', 'SHIPPED', null],
    ]);
  });

  it('detail: item of soft-deleted product has productDeleted true; live product false', async () => {
    const id = await insertOrder({ no: 'ORD-X', createdAt: '2026-11-01T00:00:00Z' });
    const cat = (await t.dataSource.query(
      `INSERT INTO categories (name) VALUES ('c') RETURNING id`,
    )) as Array<{ id: string }>;
    for (const [sku, deleted] of [
      ['LIVE-1', false],
      ['GONE-1', true],
    ] as const) {
      const p = (await t.dataSource.query(
        `INSERT INTO products (sku,name,"categoryId",price,status,description,"deletedAt")
         VALUES ($1,'cur',$2,100,'ON_SALE','',$3) RETURNING id`,
        [sku, cat[0]!.id, deleted ? '2026-11-02T00:00:00Z' : null],
      )) as Array<{ id: string }>;
      await t.dataSource.query(
        `INSERT INTO order_items ("orderId","productId",sku,"productName",quantity,"unitPrice") VALUES ($1,$2,$3,'snap',1,100)`,
        [id, p[0]!.id, sku],
      );
    }
    const res = await get(`${URL}/${id}`);
    const d = res.body as OrderDetail;
    expect(d.items.map((i) => [i.sku, i.productDeleted])).toEqual([
      ['GONE-1', true],
      ['LIVE-1', false],
    ]);
  });

  it('detail unknown -> 404; non-uuid -> 400', async () => {
    const res = await get(`${URL}/00000000-0000-4000-8000-000000000000`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect((await get(`${URL}/abc`)).status).toBe(400);
  });

  it('viewer can read; unauthenticated 401', async () => {
    const id = await insertOrder({ no: 'ORD-V', createdAt: '2026-11-01T00:00:00Z' });
    expect((await get(URL, 'viewer')).status).toBe(200);
    expect((await get(`${URL}/${id}`, 'viewer')).status).toBe(200);
    expect((await request(t.app.getHttpServer()).get(URL)).status).toBe(401);
  });
});
