import request from 'supertest';
import { OrderStatus, Role, type DashboardSummary, type Paginated } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/auth/password.js';
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
  }): Promise<void> {
    seq += 1;
    const created = o.createdAt ?? '2026-11-01T00:00:00Z';
    await t.dataSource.query(
      `INSERT INTO orders ("orderNo","customerName",status,"totalAmount","createdAt","updatedAt","confirmedAt")
       VALUES ($1,'홍길동',$2,$3,$4,$4,$5)`,
      [
        `ORD-D${seq}`,
        o.status ?? OrderStatus.CONFIRMED,
        o.total ?? 1000,
        created,
        o.confirmedAt ?? null,
      ],
    );
  }

  async function makeProduct(sku: string, quantity: number, safetyStock: number, deleted = false) {
    await t.dataSource.transaction(async (m) => {
      const p = await m.save(
        m.create(Product, {
          sku,
          name: sku,
          categoryId,
          price: 1000,
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

  it('lowStockCount equals GET /products?lowStock=true meta.total; soft-deleted excluded', async () => {
    await makeProduct('LOW-1', 2, 5);
    await makeProduct('LOW-2', 5, 5);
    await makeProduct('OK-1', 6, 5);
    await makeProduct('GONE-1', 0, 5, true);
    const s = await summary();
    const list = await request(t.app.getHttpServer())
      .get('/api/v1/products?lowStock=true')
      .set('Cookie', cookie);
    expect(s.lowStockCount).toBe(2);
    expect(s.lowStockCount).toBe((list.body as Paginated<unknown>).meta.total);
  });

  it('viewer 200; no cookie 401', async () => {
    expect((await get(cookie)).status).toBe(200);
    expect((await get()).status).toBe(401);
  });
});
