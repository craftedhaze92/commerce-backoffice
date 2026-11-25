import request from 'supertest';
import {
  InventoryChangeReason,
  OrderStatus,
  Role,
  type InsufficientStockItem,
  type InventoryHistoryItem,
  type OrderDetail,
  type Paginated,
} from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { hashPassword } from '../src/common/password.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/orders';

describe('order status transitions (e2e)', () => {
  let t: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;
  let categoryId: string;
  let seq = 0;
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
      'TRUNCATE users, products, categories, orders, order_sequences, inventory_histories RESTART IDENTITY CASCADE',
    );
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
    const [cat] = (await ds.query(
      `INSERT INTO categories (name) VALUES ('의류') RETURNING id`,
    )) as Array<{ id: string }>;
    categoryId = cat!.id;
  });

  async function product(sku: string, quantity: number): Promise<string> {
    const [p] = (await t.dataSource.query(
      `INSERT INTO products (sku,name,"categoryId",price,status,description)
       VALUES ($1,$2,$3,1000,'ON_SALE','') RETURNING id`,
      [sku, `${sku}-name`, categoryId],
    )) as Array<{ id: string }>;
    await t.dataSource.query(
      `INSERT INTO inventories ("productId",quantity,"safetyStock") VALUES ($1,$2,0)`,
      [p!.id, quantity],
    );
    return p!.id;
  }

  /** Inserts a PENDING order (with its initial status history row) holding `items` in the given order. */
  async function order(items: Array<[productId: string, qty: number]>): Promise<string> {
    seq += 1;
    const [o] = (await t.dataSource.query(
      `INSERT INTO orders ("orderNo","customerName",status,"totalAmount")
       VALUES ($1,'홍길동','PENDING',$2) RETURNING id`,
      [`ORD-T-${String(seq).padStart(6, '0')}`, items.reduce((s, [, q]) => s + q * 1000, 0)],
    )) as Array<{ id: string }>;
    for (const [productId, qty] of items) {
      await t.dataSource.query(
        `INSERT INTO order_items ("orderId","productId",sku,"productName",quantity,"unitPrice")
         SELECT $1, p.id, p.sku, p.name, $3, 1000 FROM products p WHERE p.id = $2`,
        [o!.id, productId, qty],
      );
    }
    await t.dataSource.query(
      `INSERT INTO order_status_histories ("orderId","fromStatus","toStatus","actorId")
       VALUES ($1, NULL, 'PENDING', NULL)`,
      [o!.id],
    );
    return o!.id;
  }

  const act = (id: string, action: string, who = 'manager', csrf = true) => {
    const r = request(server).post(`${URL}/${id}/${action}`).set('Cookie', cookies[who]!);
    if (csrf) r.set('X-Requested-With', 'fetch');
    return r.send();
  };
  const stock = async (productId: string) => {
    const [r] = (await t.dataSource.query(
      'SELECT quantity FROM inventories WHERE "productId" = $1',
      [productId],
    )) as Array<{ quantity: number }>;
    return r!.quantity;
  };
  const invHistory = (where = 'TRUE', params: unknown[] = []) =>
    t.dataSource.query(
      `SELECT * FROM inventory_histories WHERE ${where} ORDER BY "createdAt", id`,
      params,
    ) as Promise<
      Array<{
        productId: string;
        delta: number;
        quantityAfter: number;
        reason: string;
        refOrderId: string | null;
        actorId: string | null;
      }>
    >;
  const managerId = async () =>
    (await t.dataSource.getRepository(User).findOneByOrFail({ email: 'manager@demo.com' })).id;

  it('confirm deducts stock, writes ORDER_CONFIRM history + status history, sets confirmedAt', async () => {
    const a = await product('SKU-A', 10);
    const b = await product('SKU-B', 5);
    const id = await order([
      [a, 3],
      [b, 2],
    ]);
    const res = await act(id, 'confirm');
    expect(res.status).toBe(200);
    const body = res.body as OrderDetail;
    expect(body.id).toBe(id);
    expect(body.status).toBe(OrderStatus.CONFIRMED);
    expect(body.confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.cancelledAt).toBeNull();
    expect(body.history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, OrderStatus.PENDING],
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
    ]);
    expect(await stock(a)).toBe(7);
    expect(await stock(b)).toBe(3);
    const rows = await invHistory();
    expect(rows).toHaveLength(2);
    const actor = await managerId();
    for (const r of rows) {
      expect(r.reason).toBe(InventoryChangeReason.ORDER_CONFIRM);
      expect(r.refOrderId).toBe(id);
      expect(r.actorId).toBe(actor);
    }
    expect(rows.find((r) => r.productId === a)).toMatchObject({ delta: -3, quantityAfter: 7 });
    const [st] = (await t.dataSource.query(
      `SELECT "actorId" FROM order_status_histories WHERE "orderId" = $1 AND "toStatus" = 'CONFIRMED'`,
      [id],
    )) as Array<{ actorId: string }>;
    expect(st!.actorId).toBe(actor);
  });

  it('two concurrent confirms competing for stock 10 (qty 6 each) → one 200 one 422, final 4, 1 history row', async () => {
    const a = await product('SKU-A', 10);
    const x = await order([[a, 6]]);
    const y = await order([[a, 6]]);
    const [rx, ry] = await Promise.all([act(x, 'confirm'), act(y, 'confirm')]);
    expect([rx.status, ry.status].sort((p, q) => p - q)).toEqual([200, 422]);
    const loser = rx.status === 422 ? rx : ry;
    expect(loser.body.code).toBe('INSUFFICIENT_STOCK');
    expect(loser.body.details).toEqual([
      { productId: a, sku: 'SKU-A', name: 'SKU-A-name', requested: 6, available: 4 },
    ]);
    expect(await stock(a)).toBe(4);
    const rows = await invHistory('reason = $1', [InventoryChangeReason.ORDER_CONFIRM]);
    expect(rows).toHaveLength(1);
    const loserId = rx.status === 422 ? x : y;
    const [lo] = (await t.dataSource.query('SELECT status FROM orders WHERE id = $1', [
      loserId,
    ])) as Array<{ status: string }>;
    expect(lo!.status).toBe(OrderStatus.PENDING);
  });

  it('reversed product order across two orders confirmed concurrently → no 500/40P01', async () => {
    const a = await product('SKU-A', 1000);
    const b = await product('SKU-B', 1000);
    for (let i = 0; i < 10; i++) {
      const x = await order([
        [a, 1],
        [b, 1],
      ]);
      const y = await order([
        [b, 1],
        [a, 1],
      ]);
      const [rx, ry] = await Promise.all([act(x, 'confirm'), act(y, 'confirm')]);
      expect([rx.status, ry.status]).toEqual([200, 200]);
    }
    expect(await stock(a)).toBe(980);
    expect(await stock(b)).toBe(980);
  });

  // PATCH locks products then updates inventories; confirm locks inventories then inserts
  // inventory_histories (FK → FOR KEY SHARE on products). With FOR UPDATE on the product this
  // deadlocked (40P01 → 500) in roughly 1 of 2,000 pairs; FOR NO KEY UPDATE makes them compatible.
  it('product PATCH (safetyStock) concurrent with confirm on the same product → no deadlock', async () => {
    const a = await product('SKU-A', 1000);
    for (let i = 0; i < 20; i++) {
      const id = await order([[a, 1]]);
      const [patch, confirm] = await Promise.all([
        request(server)
          .patch(`/api/v1/products/${a}`)
          .set('Cookie', cookies.manager!)
          .set('X-Requested-With', 'fetch')
          .send({ safetyStock: i + 1 }),
        act(id, 'confirm'),
      ]);
      expect([patch.status, confirm.status]).toEqual([200, 200]);
    }
    expect(await stock(a)).toBe(980);
    const [inv] = (await t.dataSource.query(
      'SELECT "safetyStock" FROM inventories WHERE "productId" = $1',
      [a],
    )) as Array<{ safetyStock: number }>;
    expect(inv!.safetyStock).toBe(20);
  });

  it('partial shortage → 422 details only short item with available; nothing changed', async () => {
    const a = await product('SKU-A', 10);
    const b = await product('SKU-B', 1);
    const id = await order([
      [a, 3],
      [b, 2],
    ]);
    const res = await act(id, 'confirm');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.details as InsufficientStockItem[]).toEqual([
      { productId: b, sku: 'SKU-B', name: 'SKU-B-name', requested: 2, available: 1 },
    ]);
    expect(await stock(a)).toBe(10);
    expect(await stock(b)).toBe(1);
    expect(await invHistory()).toHaveLength(0);
    const detail = (await request(server).get(`${URL}/${id}`).set('Cookie', cookies.viewer!))
      .body as OrderDetail;
    expect(detail.status).toBe(OrderStatus.PENDING);
    expect(detail.confirmedAt).toBeNull();
    expect(detail.history).toHaveLength(1);
  });

  it('same order confirmed twice concurrently → one 200 one 409, stock deducted once', async () => {
    const a = await product('SKU-A', 10);
    for (let i = 0; i < 5; i++) {
      const id = await order([[a, 1]]);
      const [r1, r2] = await Promise.all([act(id, 'confirm'), act(id, 'confirm')]);
      expect([r1.status, r2.status].sort((p, q) => p - q)).toEqual([200, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      expect(loser.body.details).toEqual({
        from: OrderStatus.CONFIRMED,
        to: OrderStatus.CONFIRMED,
      });
      const rows = await invHistory('"refOrderId" = $1', [id]);
      expect(rows.map((r) => r.reason)).toEqual([InventoryChangeReason.ORDER_CONFIRM]);
    }
    expect(await stock(a)).toBe(5);
  });

  it('confirm vs cancel on the same PENDING order concurrently → stock matches the winner', async () => {
    const a = await product('SKU-A', 10);
    for (let i = 0; i < 5; i++) {
      const id = await order([[a, 3]]);
      const [confirm, cancel] = await Promise.all([act(id, 'confirm'), act(id, 'cancel')]);
      // Cancel always succeeds: from PENDING, or from CONFIRMED if confirm won the lock.
      expect(cancel.status).toBe(200);
      expect(cancel.body.status).toBe(OrderStatus.CANCELLED);
      const rows = await invHistory('"refOrderId" = $1', [id]);
      if (confirm.status === 200) {
        // createdAt은 트랜잭션 시작 시각이라 동시 요청에서는 락 순서와 어긋날 수 있다.
        // 락 순서는 quantityAfter(7 -> 10)가 그대로 보여 준다
        const byLockOrder = [...rows].sort((x, y) => x.quantityAfter - y.quantityAfter);
        expect(byLockOrder.map((r) => [r.reason, r.delta])).toEqual([
          [InventoryChangeReason.ORDER_CONFIRM, -3],
          [InventoryChangeReason.ORDER_CANCEL, 3],
        ]);
        expect(cancel.body.confirmedAt).not.toBeNull();
      } else {
        expect(confirm.status).toBe(409);
        expect(confirm.body.details).toEqual({
          from: OrderStatus.CANCELLED,
          to: OrderStatus.CONFIRMED,
        });
        expect(rows).toHaveLength(0);
        expect(cancel.body.confirmedAt).toBeNull();
      }
      expect(await stock(a)).toBe(10);
    }
  });

  it('product PATCH does not block on FOR KEY SHARE held by another tx (lock is FOR NO KEY UPDATE)', async () => {
    const a = await product('SKU-A', 10);
    const qr = t.dataSource.createQueryRunner();
    await qr.connect();
    let patch: Promise<number | Error> | undefined;
    try {
      await qr.startTransaction();
      // What a confirm in progress holds: inserting inventory_histories takes FOR KEY SHARE via the FK.
      await qr.query('SELECT 1 FROM products WHERE id = $1 FOR KEY SHARE', [a]);
      patch = request(server)
        .patch(`/api/v1/products/${a}`)
        .set('Cookie', cookies.manager!)
        .set('X-Requested-With', 'fetch')
        .send({ name: '새 이름' })
        .then(
          (r) => r.status,
          (e: Error) => e,
        );
      const outcome = await Promise.race([
        patch,
        new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 2000)),
      ]);
      expect(outcome).toBe(200);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
      await patch;
    }
  });

  it('confirm twice → second 409 CONFLICT details {from: CONFIRMED, to: CONFIRMED}; stock deducted once', async () => {
    const a = await product('SKU-A', 10);
    const id = await order([[a, 4]]);
    expect((await act(id, 'confirm')).status).toBe(200);
    const res = await act(id, 'confirm');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.details).toEqual({
      from: OrderStatus.CONFIRMED,
      to: OrderStatus.CONFIRMED,
    });
    expect(await stock(a)).toBe(6);
    expect(await invHistory()).toHaveLength(1);
  });

  it('cancel CONFIRMED → stock restored, ORDER_CANCEL history, cancelledAt; inventory-history shows refOrderNo', async () => {
    const a = await product('SKU-A', 10);
    const id = await order([[a, 4]]);
    expect((await act(id, 'confirm')).status).toBe(200);
    const res = await act(id, 'cancel');
    expect(res.status).toBe(200);
    const body = res.body as OrderDetail;
    expect(body.status).toBe(OrderStatus.CANCELLED);
    expect(body.cancelledAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.confirmedAt).not.toBeNull();
    expect(await stock(a)).toBe(10);
    const rows = await invHistory();
    expect(rows.map((r) => [r.reason, r.delta, r.quantityAfter, r.refOrderId])).toEqual([
      [InventoryChangeReason.ORDER_CONFIRM, -4, 6, id],
      [InventoryChangeReason.ORDER_CANCEL, 4, 10, id],
    ]);

    const hist = (
      await request(server)
        .get(`/api/v1/products/${a}/inventory-history`)
        .set('Cookie', cookies.viewer!)
    ).body as Paginated<InventoryHistoryItem>;
    expect(hist.items.map((h) => [h.reason, h.refOrderId, h.refOrderNo])).toEqual([
      [InventoryChangeReason.ORDER_CANCEL, id, body.orderNo],
      [InventoryChangeReason.ORDER_CONFIRM, id, body.orderNo],
    ]);
  });

  it('cancel PENDING → no stock change, no inventory history', async () => {
    const a = await product('SKU-A', 10);
    const id = await order([[a, 4]]);
    const res = await act(id, 'cancel');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(OrderStatus.CANCELLED);
    expect(res.body.cancelledAt).not.toBeNull();
    expect(res.body.confirmedAt).toBeNull();
    expect(await stock(a)).toBe(10);
    expect(await invHistory()).toHaveLength(0);
    // a cancelled order is terminal
    const again = await act(id, 'confirm');
    expect(again.status).toBe(409);
    expect(again.body.details).toEqual({
      from: OrderStatus.CANCELLED,
      to: OrderStatus.CONFIRMED,
    });
  });

  it('ship then deliver; cancel after ship → 409', async () => {
    const a = await product('SKU-A', 10);
    const id = await order([[a, 4]]);
    const early = await act(id, 'ship');
    expect(early.status).toBe(409);
    expect(early.body.details).toEqual({ from: OrderStatus.PENDING, to: OrderStatus.SHIPPED });
    expect((await act(id, 'confirm')).status).toBe(200);
    const shipped = await act(id, 'ship');
    expect(shipped.status).toBe(200);
    expect(shipped.body.status).toBe(OrderStatus.SHIPPED);
    const cancel = await act(id, 'cancel');
    expect(cancel.status).toBe(409);
    expect(cancel.body.code).toBe('CONFLICT');
    expect(cancel.body.details).toEqual({
      from: OrderStatus.SHIPPED,
      to: OrderStatus.CANCELLED,
    });
    const delivered = await act(id, 'deliver');
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe(OrderStatus.DELIVERED);
    expect((await act(id, 'cancel')).status).toBe(409);
    expect(await stock(a)).toBe(6);
    expect(await invHistory()).toHaveLength(1);
  });

  it('history order: PENDING→CONFIRMED→SHIPPED→DELIVERED with actorName', async () => {
    const a = await product('SKU-A', 10);
    const id = await order([[a, 1]]);
    for (const action of ['confirm', 'ship', 'deliver']) {
      expect((await act(id, action)).status).toBe(200);
    }
    const detail = (await request(server).get(`${URL}/${id}`).set('Cookie', cookies.viewer!))
      .body as OrderDetail;
    expect(detail.history.map((h) => [h.fromStatus, h.toStatus, h.actorName])).toEqual([
      [null, OrderStatus.PENDING, null],
      [OrderStatus.PENDING, OrderStatus.CONFIRMED, 'manager-name'],
      [OrderStatus.CONFIRMED, OrderStatus.SHIPPED, 'manager-name'],
      [OrderStatus.SHIPPED, OrderStatus.DELIVERED, 'manager-name'],
    ]);
  });

  it('viewer → 403; no CSRF header → 403; unknown order → 404; unknown action → 404; bad uuid → 400', async () => {
    const a = await product('SKU-A', 10);
    const id = await order([[a, 1]]);
    expect((await act(id, 'confirm', 'viewer')).status).toBe(403);
    expect((await act(id, 'confirm', 'manager', false)).status).toBe(403);
    const missing = await act('00000000-0000-4000-8000-000000000000', 'confirm');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    expect((await act(id, 'refund')).status).toBe(404);
    expect((await act('not-a-uuid', 'confirm')).status).toBe(400);
    expect(await stock(a)).toBe(10);
    const [o] = (await t.dataSource.query('SELECT status FROM orders WHERE id = $1', [
      id,
    ])) as Array<{ status: string }>;
    expect(o!.status).toBe(OrderStatus.PENDING);
  });

  it('product soft-deleted after ordering → confirm still works (inventory row exists)', async () => {
    const a = await product('SKU-A', 10);
    const id = await order([[a, 2]]);
    const del = await request(server)
      .delete(`/api/v1/products/${a}`)
      .set('Cookie', cookies.manager!)
      .set('X-Requested-With', 'fetch');
    expect(del.status).toBe(204);
    const res = await act(id, 'confirm');
    expect(res.status).toBe(200);
    expect(await stock(a)).toBe(8);
  });
});
