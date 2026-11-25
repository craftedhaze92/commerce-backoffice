import request from 'supertest';
import { OrderStatus, ProductStatus, Role, type OrderListItem } from '@bo/contracts';
import { QueryFailedError } from 'typeorm';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { Category } from '../src/categories/category.entity.js';
import { Inventory } from '../src/products/inventory.entity.js';
import { Product } from '../src/products/product.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/dev/orders/random';

async function seedUsers(t: TestApp) {
  const ds = t.dataSource;
  await ds.query(
    'TRUNCATE users, products, categories, orders, order_sequences RESTART IDENTITY CASCADE',
  );
  const catId = (await ds.getRepository(Category).save({ name: '의류' })).id;
  const users = ds.getRepository(User);
  const passwordHash = await hashPassword(PW);
  await users.save(
    (['manager', 'viewer'] as const).map((r) =>
      users.create({
        email: `${r}@demo.com`,
        name: `${r}-name`,
        role: r.toUpperCase() as Role,
        passwordHash,
      }),
    ),
  );
  const cookies: Record<string, string> = {};
  for (const r of ['manager', 'viewer']) {
    const res = await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: `${r}@demo.com`, password: PW });
    const raw = res.headers['set-cookie'] as unknown as string[];
    cookies[r] = raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
  }
  return { catId, cookies };
}

async function addProducts(t: TestApp, catId: string, n: number, status = ProductStatus.ON_SALE) {
  for (let i = 1; i <= n; i++) {
    const p = await t.dataSource.getRepository(Product).save({
      sku: `SKU-${status}-${i}`,
      name: `상품 ${i}`,
      categoryId: catId,
      price: i * 1000,
      status,
      description: '',
    });
    await t.dataSource
      .getRepository(Inventory)
      .save({ productId: p.id, quantity: 10, safetyStock: 1 });
  }
}

describe('dev random orders (e2e)', () => {
  let t: TestApp;
  let catId: string;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t?.stop();
  });
  beforeEach(async () => {
    ({ catId, cookies } = await seedUsers(t));
  });

  const post = (b: unknown, who = 'manager') =>
    request(t.app.getHttpServer())
      .post(URL)
      .set('Cookie', cookies[who]!)
      .set('X-Requested-With', 'fetch')
      .send(b as object);

  it('creates N PENDING orders with snapshots, totals and initial history', async () => {
    await addProducts(t, catId, 6);
    await addProducts(t, catId, 2, ProductStatus.DRAFT);
    const res = await post({ count: 3 });
    expect(res.status).toBe(201);
    const created = res.body.created as OrderListItem[];
    expect(created).toHaveLength(3);
    for (const o of created) {
      expect(o.status).toBe(OrderStatus.PENDING);
      const items = (await t.dataSource.query('SELECT * FROM order_items WHERE "orderId" = $1', [
        o.id,
      ])) as Array<{ quantity: number; unitPrice: number; sku: string; productName: string }>;
      expect(items.length).toBeGreaterThanOrEqual(1);
      expect(items.length).toBeLessThanOrEqual(4);
      expect(o.itemCount).toBe(items.length);
      expect(o.totalAmount).toBe(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
      for (const i of items) {
        expect(i.quantity).toBeGreaterThanOrEqual(1);
        expect(i.quantity).toBeLessThanOrEqual(3);
        expect(i.sku).toMatch(/^SKU-ON_SALE-/);
        expect(i.productName).toMatch(/^상품 /);
      }
      const hist = (await t.dataSource.query(
        `SELECT h."fromStatus", h."toStatus", u.email FROM order_status_histories h
           JOIN users u ON u.id = h."actorId" WHERE h."orderId" = $1`,
        [o.id],
      )) as Array<{ fromStatus: string | null; toStatus: string; email: string }>;
      expect(hist).toEqual([{ fromStatus: null, toStatus: 'PENDING', email: 'manager@demo.com' }]);
    }
    // stock untouched
    const stock = (await t.dataSource.query(
      'SELECT count(*)::int AS c FROM inventory_histories',
    )) as Array<{ c: number }>;
    expect(stock[0]!.c).toBe(0);
  });

  it('defaults count to 5, rejects out of range', async () => {
    await addProducts(t, catId, 3);
    expect(((await post({})).body.created as unknown[]).length).toBe(5);
    expect((await post({ count: 0 })).status).toBe(400);
    expect((await post({ count: 51 })).status).toBe(400);
    expect((await post({ count: null })).status).toBe(400);
  });

  it('orderNo format ORD-YYYYMMDD-NNNN using KST date', async () => {
    await addProducts(t, catId, 3);
    const kstDay = () =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
        .format(new Date())
        .replaceAll('-', '');
    // 요청이 KST 자정을 가로지를 수 있어 앞뒤 날짜를 모두 허용한다
    const before = kstDay();
    const res = await post({ count: 2 });
    const after = kstDay();
    const [a, b] = res.body.created as OrderListItem[];
    const dates = new Set([before, after]);
    const match = (no: string, seq: string) => [...dates].some((d) => no === `ORD-${d}-${seq}`);
    expect(match(a!.orderNo, '0001')).toBe(true);
    expect(match(b!.orderNo, '0002')).toBe(true);
  });

  it('20 concurrent random-order requests -> all orderNos unique', async () => {
    await addProducts(t, catId, 5);
    const results = await Promise.all(Array.from({ length: 20 }, () => post({ count: 1 })));
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    const nos = results.map((r) => (r.body.created as OrderListItem[])[0]!.orderNo);
    expect(new Set(nos).size).toBe(20);
  });

  it('no ON_SALE products -> 422 and nothing persisted', async () => {
    await addProducts(t, catId, 2, ProductStatus.DRAFT);
    const res = await post({ count: 2 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.message).toBe('판매 중인 상품이 없습니다');
    const c = (await t.dataSource.query('SELECT count(*)::int AS c FROM orders')) as Array<{
      c: number;
    }>;
    expect(c[0]!.c).toBe(0);
  });

  it('viewer -> 403', async () => {
    await addProducts(t, catId, 2);
    expect((await post({ count: 1 }, 'viewer')).status).toBe(403);
  });

  it('quantity CHECK > 0 enforced by DB', async () => {
    await addProducts(t, catId, 1);
    const [o] = (await post({ count: 1 })).body.created as OrderListItem[];
    const err = await t.dataSource
      .query('UPDATE order_items SET quantity = 0 WHERE "orderId" = $1', [o!.id])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QueryFailedError);
    expect((err as QueryFailedError & { driverError: { code: string } }).driverError.code).toBe(
      '23514',
    );
  });
});

describe('dev random orders in production (e2e)', () => {
  let t: TestApp;
  afterAll(async () => {
    await t?.stop();
  });

  it('-> 404', async () => {
    t = await createTestApp({ env: { NODE_ENV: 'production' } });
    const { cookies } = await seedUsers(t);
    const res = await request(t.app.getHttpServer())
      .post(URL)
      .set('Cookie', cookies.manager!)
      .set('X-Requested-With', 'fetch')
      .send({ count: 1 });
    expect(res.status).toBe(404);
  });
});
