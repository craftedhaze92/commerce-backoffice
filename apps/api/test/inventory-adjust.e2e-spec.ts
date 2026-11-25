import request from 'supertest';
import {
  InventoryChangeReason,
  ProductStatus,
  Role,
  type InventoryHistoryItem,
  type Paginated,
} from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { Category } from '../src/categories/category.entity.js';
import { Inventory } from '../src/products/inventory.entity.js';
import { Product } from '../src/products/product.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/products';

describe('inventory adjust and history (e2e)', () => {
  let t: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;
  let productId: string;
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
    await ds.query(
      'TRUNCATE users, products, categories, inventory_histories RESTART IDENTITY CASCADE',
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
    for (const r of ['manager', 'viewer']) {
      const res = await request(server)
        .post('/api/v1/auth/login')
        .set('X-Requested-With', 'fetch')
        .send({ email: `${r}@demo.com`, password: PW });
      const raw = res.headers['set-cookie'] as unknown as string[];
      cookies[r] = raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
    }
    const p = await ds.getRepository(Product).save({
      sku: 'SKU-0001',
      name: '티셔츠',
      categoryId: catId,
      price: 1000,
      status: ProductStatus.ON_SALE,
      description: '',
    });
    productId = p.id;
    await ds.getRepository(Inventory).save({ productId, quantity: 10, safetyStock: 2 });
  });

  const adjust = (b: unknown, who = 'manager', id = productId, csrf = true) => {
    const r = request(server).patch(`${URL}/${id}/inventory`).set('Cookie', cookies[who]!);
    if (csrf) r.set('X-Requested-With', 'fetch');
    return r.send(b as object);
  };
  const history = (qs = '', who = 'viewer') =>
    request(server).get(`${URL}/${productId}/inventory-history${qs}`).set('Cookie', cookies[who]!);
  const stock = async () =>
    (await t.dataSource.getRepository(Inventory).findOneByOrFail({ productId })).quantity;
  const historyCount = () =>
    t.dataSource.query('SELECT count(*)::int AS c FROM inventory_histories');

  it('delta pushing stock past int4 max -> 400 and stock/history unchanged', async () => {
    await t.dataSource.query(
      'UPDATE inventories SET quantity = 2147000000 WHERE "productId" = $1',
      [productId],
    );
    const res = await adjust({ delta: 1_000_000, note: '상한 초과' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details).toEqual([
      { field: 'delta', messages: ['재고 상한을 넘을 수 없습니다'] },
    ]);
    expect(await stock()).toBe(2147000000);
    expect((await historyCount())[0].c).toBe(0);
  });

  it('manager +5 -> 200, stock increases, history row MANUAL_ADJUST with note and actor', async () => {
    const res = await adjust({ delta: 5, note: '입고' });
    expect(res.status).toBe(200);
    expect(res.body.stock).toBe(15);
    const rows = (await t.dataSource.query(
      `SELECT h.*, u.email FROM inventory_histories h JOIN users u ON u.id = h."actorId"`,
    )) as Array<{
      delta: number;
      quantityAfter: number;
      reason: string;
      note: string;
      email: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      delta: 5,
      quantityAfter: 15,
      reason: InventoryChangeReason.MANUAL_ADJUST,
      note: '입고',
      email: 'manager@demo.com',
    });
  });

  it('-quantity-1 -> 422 INSUFFICIENT_STOCK with details, stock unchanged, no history', async () => {
    const res = await adjust({ delta: -11, note: '폐기' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.details).toEqual([
      expect.objectContaining({ productId, requested: 11, available: 10 }),
    ]);
    expect(await stock()).toBe(10);
    expect((await historyCount())[0].c).toBe(0);
  });

  it.each([[0], [1.5], [1_000_001], [-1_000_001], ['3']])('delta %s -> 400', async (delta) => {
    const res = await adjust({ delta, note: 'x' });
    expect(res.status).toBe(400);
  });

  it('note blank/201 chars -> 400, note is trimmed', async () => {
    expect((await adjust({ delta: 1, note: '   ' })).status).toBe(400);
    expect((await adjust({ delta: 1, note: 'a'.repeat(201) })).status).toBe(400);
    expect((await adjust({ delta: 1 })).status).toBe(400);
    const ok = await adjust({ delta: 1, note: '  메모  ' });
    expect(ok.status).toBe(200);
    const row = (await t.dataSource.query('SELECT note FROM inventory_histories')) as Array<{
      note: string;
    }>;
    expect(row[0]!.note).toBe('메모');
  });

  it('viewer -> 403; no X-Requested-With -> 403 CSRF_REQUIRED', async () => {
    expect((await adjust({ delta: 1, note: 'x' }, 'viewer')).status).toBe(403);
    const res = await adjust({ delta: 1, note: 'x' }, 'manager', productId, false);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_REQUIRED');
  });

  it('deleted or unknown product -> 404', async () => {
    await t.dataSource.getRepository(Product).softDelete(productId);
    expect((await adjust({ delta: 1, note: 'x' })).status).toBe(404);
    expect(
      (await adjust({ delta: 1, note: 'x' }, 'manager', '00000000-0000-4000-8000-000000000000'))
        .status,
    ).toBe(404);
    expect((await history()).status).toBe(404);
  });

  it('history: newest first, paginated, actorName filled, default size 10', async () => {
    for (let i = 1; i <= 12; i++) await adjust({ delta: 1, note: `n${i}` });
    const res = await history();
    expect(res.status).toBe(200);
    const body = res.body as Paginated<InventoryHistoryItem>;
    expect(body.meta).toEqual({ page: 1, size: 10, total: 12, totalPages: 2 });
    expect(body.items).toHaveLength(10);
    expect(body.items[0]).toMatchObject({
      note: 'n12',
      quantityAfter: 22,
      actorName: 'manager-name',
      refOrderNo: null,
      refOrderId: null,
      reason: InventoryChangeReason.MANUAL_ADJUST,
    });
    expect(body.items[9]!.note).toBe('n3');
    const p2 = (await history('?page=2&size=10')).body as Paginated<InventoryHistoryItem>;
    expect(p2.items.map((i) => i.note)).toEqual(['n2', 'n1']);
    expect((await history('?size=101')).status).toBe(400);
  });

  it('two concurrent -6 on stock 10 -> one 200 one 422, final 4', async () => {
    const [a, b] = await Promise.all([
      adjust({ delta: -6, note: 'a' }),
      adjust({ delta: -6, note: 'b' }),
    ]);
    expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 422]);
    expect(await stock()).toBe(4);
    expect((await historyCount())[0].c).toBe(1);
  });
});
