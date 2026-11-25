import request from 'supertest';
import {
  OrderStatus,
  ProductStatus,
  Role,
  type CategorySales,
  type DashboardSummary,
  type Paginated,
  type SalesTrend,
} from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { CLOCK } from '../src/common/clock.js';
import { Category } from '../src/categories/category.entity.js';
import { Inventory } from '../src/products/inventory.entity.js';
import { Product } from '../src/products/product.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/dashboard/summary';
// 2026-11-21 00:30 KST
const NOW = new Date('2026-11-20T15:30:00Z');

describe('dashboard summary (e2e)', () => {
  let t: TestApp;
  let cookie: string;
  let categoryId: string;

  beforeAll(async () => {
    t = await createTestApp({ providers: [{ provide: CLOCK, useValue: () => NOW }] });
  });
  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    const ds = t.dataSource;
    await ds.query(
      'TRUNCATE users, products, categories, orders, order_sequences RESTART IDENTITY CASCADE',
    );
    const cat = await ds.getRepository(Category).save({ name: '의류' });
    categoryId = cat.id;
    const users = ds.getRepository(User);
    await users.save(
      users.create({
        email: 'viewer@demo.com',
        name: 'viewer',
        role: Role.VIEWER,
        passwordHash: await hashPassword(PW),
      }),
    );
    const res = await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'viewer@demo.com', password: PW });
    const raw = res.headers['set-cookie'] as unknown as string[];
    cookie = raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
  });

  let seq = 0;
  async function insertOrder(o: {
    status?: OrderStatus;
    total?: number;
    createdAt?: string;
    confirmedAt?: string | null;
  }): Promise<string> {
    seq += 1;
    const created = o.createdAt ?? '2026-11-01T00:00:00Z';
    const rows = (await t.dataSource.query(
      `INSERT INTO orders ("orderNo","customerName",status,"totalAmount","createdAt","updatedAt","confirmedAt")
       VALUES ($1,'홍길동',$2,$3,$4,$4,$5) RETURNING id`,
      [
        `ORD-D${seq}`,
        o.status ?? OrderStatus.CONFIRMED,
        o.total ?? 1000,
        created,
        o.confirmedAt ?? null,
      ],
    )) as Array<{ id: string }>;
    return rows[0]!.id;
  }

  /** One order with one line item; total = quantity × unitPrice. */
  async function insertSale(o: {
    confirmedAt: string;
    status?: OrderStatus;
    productId: string;
    quantity?: number;
    unitPrice: number;
  }): Promise<void> {
    const quantity = o.quantity ?? 1;
    const orderId = await insertOrder({
      status: o.status ?? OrderStatus.CONFIRMED,
      total: quantity * o.unitPrice,
      confirmedAt: o.confirmedAt,
    });
    await t.dataSource.query(
      `INSERT INTO order_items ("orderId","productId",sku,"productName",quantity,"unitPrice")
       SELECT $1, id, sku, name, $3, $4 FROM products WHERE id = $2`,
      [orderId, o.productId, quantity, o.unitPrice],
    );
  }

  async function newProduct(sku: string, catId = categoryId, deleted = false): Promise<string> {
    const p = await t.dataSource.getRepository(Product).save(
      t.dataSource.getRepository(Product).create({
        sku,
        name: sku,
        categoryId: catId,
        price: 1000,
        ...(deleted ? { deletedAt: new Date() } : {}),
      }),
    );
    return p.id;
  }

  async function makeProduct(
    sku: string,
    quantity: number,
    safetyStock: number,
    deleted = false,
    status?: ProductStatus,
  ) {
    await t.dataSource.transaction(async (m) => {
      const p = await m.save(
        m.create(Product, {
          sku,
          name: sku,
          categoryId,
          price: 1000,
          ...(status ? { status } : {}),
          ...(deleted ? { deletedAt: new Date() } : {}),
        }),
      );
      await m.save(m.create(Inventory, { productId: p.id, quantity, safetyStock }));
    });
  }

  const get = (cookieValue?: string) => {
    const r = request(t.app.getHttpServer()).get(URL);
    return cookieValue ? r.set('Cookie', cookieValue) : r;
  };
  const summary = async () => (await get(cookie)).body as DashboardSummary;

  it('empty DB → all zeros, today 2026-11-21', async () => {
    const res = await get(cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      today: '2026-11-21',
      todayRevenue: 0,
      yesterdayRevenue: 0,
      todayOrders: 0,
      yesterdayOrders: 0,
      pendingCount: 0,
      toShipCount: 0,
      lowStockCount: 0,
    });
  });

  it('confirmed at 11-20 23:59 KST is yesterdayRevenue; at 11-21 00:00 KST is todayRevenue', async () => {
    await insertOrder({ total: 700, confirmedAt: '2026-11-20T14:59:00+00:00' }); // 11-20 23:59 KST
    await insertOrder({ total: 300, confirmedAt: '2026-11-20T15:00:00+00:00' }); // 11-21 00:00 KST
    const s = await summary();
    expect(s.yesterdayRevenue).toBe(700);
    expect(s.todayRevenue).toBe(300);
  });

  it('PENDING and CANCELLED (even with confirmedAt) are excluded from revenue', async () => {
    const at = '2026-11-20T15:10:00Z';
    await insertOrder({ status: OrderStatus.PENDING, total: 111, confirmedAt: at });
    await insertOrder({ status: OrderStatus.CANCELLED, total: 222, confirmedAt: at });
    await insertOrder({ status: OrderStatus.SHIPPED, total: 400, confirmedAt: at });
    await insertOrder({ status: OrderStatus.DELIVERED, total: 50, confirmedAt: at });
    expect((await summary()).todayRevenue).toBe(450);
  });

  it('two confirmed orders of 1_500_000_000 today → todayRevenue === 3_000_000_000 (number)', async () => {
    const at = '2026-11-20T15:10:00Z';
    await insertOrder({ total: 1_500_000_000, confirmedAt: at });
    await insertOrder({ total: 1_500_000_000, confirmedAt: at });
    const res = await get(cookie);
    expect(res.status).toBe(200);
    expect(res.body.todayRevenue).toBe(3_000_000_000);
    expect(typeof res.body.todayRevenue).toBe('number');
  });

  it('todayOrders counts createdAt today in any status, including CANCELLED', async () => {
    await insertOrder({ status: OrderStatus.PENDING, createdAt: '2026-11-20T15:05:00Z' });
    await insertOrder({
      status: OrderStatus.CANCELLED,
      createdAt: '2026-11-20T15:06:00Z',
      confirmedAt: '2026-11-20T15:07:00Z',
    });
    await insertOrder({ status: OrderStatus.PENDING, createdAt: '2026-11-20T14:59:00Z' });
    const s = await summary();
    expect(s.todayOrders).toBe(2);
    expect(s.yesterdayOrders).toBe(1);
  });

  it('pendingCount / toShipCount count current PENDING / CONFIRMED regardless of date', async () => {
    await insertOrder({ status: OrderStatus.PENDING, createdAt: '2026-01-01T00:00:00Z' });
    await insertOrder({ status: OrderStatus.PENDING, createdAt: '2026-11-20T15:05:00Z' });
    await insertOrder({ status: OrderStatus.CONFIRMED, confirmedAt: '2026-02-01T00:00:00Z' });
    await insertOrder({ status: OrderStatus.SHIPPED, confirmedAt: '2026-02-01T00:00:00Z' });
    const s = await summary();
    expect(s.pendingCount).toBe(2);
    expect(s.toShipCount).toBe(1);
  });

  it('lowStockCount equals GET /products?lowStock=true meta.total; counts non-ON_SALE, excludes soft-deleted', async () => {
    await makeProduct('LOW-1', 2, 5);
    await makeProduct('LOW-2', 5, 5);
    await makeProduct('OK-1', 6, 5);
    await makeProduct('GONE-1', 0, 5, true);
    await makeProduct('HIDDEN-LOW', 1, 5, false, ProductStatus.HIDDEN);
    const s = await summary();
    const list = await request(t.app.getHttpServer())
      .get('/api/v1/products?lowStock=true')
      .set('Cookie', cookie);
    expect(s.lowStockCount).toBe(3); // LOW-1, LOW-2, and the HIDDEN one (status is irrelevant)
    expect(s.lowStockCount).toBe((list.body as Paginated<unknown>).meta.total);
  });

  it('viewer 200; no cookie 401', async () => {
    expect((await get(cookie)).status).toBe(200);
    expect((await get()).status).toBe(401);
  });

  describe('sales-trend / category-sales', () => {
    const TREND = '/api/v1/dashboard/sales-trend';
    const CATS = '/api/v1/dashboard/category-sales';
    const trend = async (q = '') =>
      (
        await request(t.app.getHttpServer())
          .get(TREND + q)
          .set('Cookie', cookie)
      ).body as SalesTrend;
    const cats = async (q = '') =>
      (
        await request(t.app.getHttpServer())
          .get(CATS + q)
          .set('Cookie', cookie)
      ).body as CategorySales;

    it('default days=30: 30 points from 2026-10-23 to 2026-11-21, ascending, zero-filled', async () => {
      const res = await request(t.app.getHttpServer()).get(TREND).set('Cookie', cookie);
      expect(res.status).toBe(200);
      const body = res.body as SalesTrend;
      expect(body.days).toBe(30);
      expect(body.from).toBe('2026-10-23');
      expect(body.to).toBe('2026-11-21');
      expect(body.total).toBe(0);
      expect(body.points).toHaveLength(30);
      expect(body.points[0]).toEqual({ date: '2026-10-23', revenue: 0, orders: 0 });
      expect(body.points[29]!.date).toBe('2026-11-21');
      const dates = body.points.map((p) => p.date);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(dates).size).toBe(30);
    });

    it('days=7 bucket by KST: confirmed 11-20 23:59 KST lands on 11-20, 11-21 00:00 KST on 11-21', async () => {
      const pid = await newProduct('A');
      await insertSale({ productId: pid, unitPrice: 700, confirmedAt: '2026-11-20T14:59:00Z' });
      await insertSale({ productId: pid, unitPrice: 300, confirmedAt: '2026-11-20T15:00:00Z' });
      const body = await trend('?days=7');
      expect(body.points).toHaveLength(7);
      expect(body.from).toBe('2026-11-15');
      expect(body.points.find((p) => p.date === '2026-11-20')).toEqual({
        date: '2026-11-20',
        revenue: 700,
        orders: 1,
      });
      expect(body.points.find((p) => p.date === '2026-11-21')).toEqual({
        date: '2026-11-21',
        revenue: 300,
        orders: 1,
      });
    });

    it('order confirmed before the window is excluded; first day of window is included', async () => {
      const pid = await newProduct('A');
      // days=7 → from 2026-11-15 00:00 KST = 2026-11-14T15:00:00Z
      await insertSale({ productId: pid, unitPrice: 100, confirmedAt: '2026-11-14T14:59:00Z' });
      await insertSale({ productId: pid, unitPrice: 200, confirmedAt: '2026-11-14T15:00:00Z' });
      const body = await trend('?days=7');
      expect(body.total).toBe(200);
      expect(body.points[0]).toEqual({ date: '2026-11-15', revenue: 200, orders: 1 });
      expect((await cats('?days=7')).total).toBe(200);
    });

    it('cancelled-after-confirm and PENDING excluded from trend and category', async () => {
      const pid = await newProduct('A');
      const at = '2026-11-20T15:10:00Z';
      await insertSale({
        productId: pid,
        unitPrice: 111,
        confirmedAt: at,
        status: OrderStatus.PENDING,
      });
      await insertSale({
        productId: pid,
        unitPrice: 222,
        confirmedAt: at,
        status: OrderStatus.CANCELLED,
      });
      await insertSale({
        productId: pid,
        unitPrice: 400,
        confirmedAt: at,
        status: OrderStatus.SHIPPED,
      });
      expect((await trend()).total).toBe(400);
      const c = await cats();
      expect(c.total).toBe(400);
      expect(c.items).toHaveLength(1);
    });

    it('trend.total === Σ points.revenue === categorySales.total for the same days', async () => {
      const a = await newProduct('A');
      await insertSale({
        productId: a,
        unitPrice: 1000,
        quantity: 3,
        confirmedAt: '2026-11-20T15:10:00Z',
      });
      await insertSale({
        productId: a,
        unitPrice: 500,
        quantity: 2,
        confirmedAt: '2026-11-10T03:00:00Z',
      });
      for (const days of [7, 30, 90]) {
        const tr = await trend(`?days=${days}`);
        const ca = await cats(`?days=${days}`);
        expect(tr.total).toBe(tr.points.reduce((s, p) => s + p.revenue, 0));
        expect(tr.total).toBe(ca.total);
        expect(ca.total).toBe(ca.items.reduce((s, i) => s + i.revenue, 0));
      }
    });

    it('category revenue sums beyond int4 as number (2 × 1_500_000_000)', async () => {
      const pid = await newProduct('A');
      const at = '2026-11-20T15:10:00Z';
      await insertSale({ productId: pid, unitPrice: 1_500_000_000, confirmedAt: at });
      await insertSale({ productId: pid, unitPrice: 1_500_000_000, confirmedAt: at });
      const c = await cats();
      expect(c.total).toBe(3_000_000_000);
      expect(c.items[0]!.revenue).toBe(3_000_000_000);
      expect(typeof c.items[0]!.revenue).toBe('number');
      expect(c.items[0]!.quantity).toBe(2);
      const tr = await trend();
      expect(tr.total).toBe(3_000_000_000);
      expect(tr.points[29]).toEqual({ date: '2026-11-21', revenue: 3_000_000_000, orders: 2 });
    });

    it('line amount multiplies in bigint (quantity × unitPrice beyond int4)', async () => {
      const pid = await newProduct('A');
      const orderId = await insertOrder({ total: 1000, confirmedAt: '2026-11-20T15:10:00Z' });
      await t.dataSource.query(
        `INSERT INTO order_items ("orderId","productId",sku,"productName",quantity,"unitPrice") VALUES ($1,$2,'A','A',3,1000000000)`,
        [orderId, pid],
      );
      expect((await cats()).total).toBe(3_000_000_000);
    });

    it('soft-deleted product revenue still counted under its category', async () => {
      const pid = await newProduct('GONE', categoryId, true);
      await insertSale({ productId: pid, unitPrice: 900, confirmedAt: '2026-11-20T15:10:00Z' });
      const c = await cats();
      expect(c.items).toEqual([{ categoryId, categoryName: '의류', revenue: 900, quantity: 1 }]);
    });

    it('categories sorted revenue desc; zero-revenue category omitted', async () => {
      const shoes = (await t.dataSource.getRepository(Category).save({ name: '신발' })).id;
      const bags = (await t.dataSource.getRepository(Category).save({ name: '가방' })).id;
      await t.dataSource.getRepository(Category).save({ name: '빈카테고리' });
      const at = '2026-11-20T15:10:00Z';
      await insertSale({ productId: await newProduct('A'), unitPrice: 100, confirmedAt: at });
      await insertSale({
        productId: await newProduct('B', shoes),
        unitPrice: 500,
        confirmedAt: at,
      });
      await insertSale({ productId: await newProduct('C', bags), unitPrice: 100, confirmedAt: at });
      const c = await cats();
      expect(c.items.map((i) => i.categoryName)).toEqual(['신발', '가방', '의류']);
    });

    it.each(['days=0', 'days=14', 'days=abc'])('400 for %s on both endpoints', async (q) => {
      for (const url of [TREND, CATS]) {
        const res = await request(t.app.getHttpServer()).get(`${url}?${q}`).set('Cookie', cookie);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
    });

    it('viewer 200; no cookie 401 on both endpoints', async () => {
      for (const url of [TREND, CATS]) {
        expect((await request(t.app.getHttpServer()).get(url).set('Cookie', cookie)).status).toBe(
          200,
        );
        expect((await request(t.app.getHttpServer()).get(url)).status).toBe(401);
      }
    });
  });
});
