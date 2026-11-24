import { InventoryChangeReason } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { AppException } from '../src/common/app-exception.js';
import { InventoryLedger } from '../src/inventory/inventory-ledger.js';

interface HistoryRow {
  productId: string;
  delta: number;
  quantityAfter: number;
  reason: string;
  note: string | null;
  refOrderId: string | null;
  actorId: string | null;
}

describe('InventoryLedger (e2e)', () => {
  let t: TestApp;
  let ledger: InventoryLedger;
  let A: string;
  let B: string;

  beforeAll(async () => {
    t = await createTestApp();
    ledger = t.app.get(InventoryLedger);
  });
  afterAll(async () => {
    await t?.stop();
  });

  const ctx = {
    reason: InventoryChangeReason.MANUAL_ADJUST,
    actorId: null,
  };

  beforeEach(async () => {
    const ds = t.dataSource;
    await ds.query('TRUNCATE products, categories, inventory_histories RESTART IDENTITY CASCADE');
    const [cat] = (await ds.query(`INSERT INTO categories (name) VALUES ('c') RETURNING id`)) as {
      id: string;
    }[];
    const ids: string[] = [];
    for (const [sku, qty] of [
      ['SKU-A', 5],
      ['SKU-B', 5],
    ] as const) {
      const [p] = (await ds.query(
        `INSERT INTO products (sku, name, "categoryId", price, status) VALUES ($1, $2, $3, 1000, 'ON_SALE') RETURNING id`,
        [sku, `name-${sku}`, cat!.id],
      )) as { id: string }[];
      await ds.query(`INSERT INTO inventories ("productId", quantity) VALUES ($1, $2)`, [
        p!.id,
        qty,
      ]);
      ids.push(p!.id);
    }
    [A, B] = ids as [string, string];
  });

  const qty = async (id: string) =>
    (
      (await t.dataSource.query(`SELECT quantity FROM inventories WHERE "productId" = $1`, [
        id,
      ])) as { quantity: number }[]
    )[0]!.quantity;
  const history = async () =>
    (await t.dataSource.query(
      `SELECT "productId", delta, "quantityAfter", reason, note, "refOrderId", "actorId" FROM inventory_histories ORDER BY "productId"`,
    )) as HistoryRow[];

  it('applies deltas, writes history with quantityAfter', async () => {
    const res = await t.dataSource.transaction((m) =>
      ledger.apply(
        m,
        [
          { productId: A, delta: -2 },
          { productId: B, delta: 3 },
        ],
        { ...ctx, note: 'memo' },
      ),
    );
    expect(res).toEqual({
      ok: true,
      after: new Map([
        [A, 3],
        [B, 8],
      ]),
    });
    expect(await qty(A)).toBe(3);
    expect(await qty(B)).toBe(8);
    const rows = await history();
    expect(rows).toHaveLength(2);
    const byProduct = new Map(rows.map((r) => [r.productId, r]));
    expect(byProduct.get(A)).toMatchObject({
      delta: -2,
      quantityAfter: 3,
      reason: 'MANUAL_ADJUST',
      note: 'memo',
      refOrderId: null,
      actorId: null,
    });
    expect(byProduct.get(B)).toMatchObject({ delta: 3, quantityAfter: 8 });
  });

  it('merges duplicate productIds before checking', async () => {
    const res = await t.dataSource.transaction((m) =>
      ledger.apply(
        m,
        [
          { productId: A, delta: -3 },
          { productId: A, delta: -3 },
        ],
        ctx,
      ),
    );
    expect(res).toEqual({
      ok: false,
      shortages: [{ productId: A, sku: 'SKU-A', name: 'name-SKU-A', requested: 6, available: 5 }],
    });
    expect(await qty(A)).toBe(5);
  });

  it('returns shortages without writing anything', async () => {
    const res = await t.dataSource.transaction((m) =>
      ledger.apply(
        m,
        [
          { productId: A, delta: -1 },
          { productId: B, delta: -9 },
        ],
        ctx,
      ),
    );
    expect(res).toEqual({
      ok: false,
      shortages: [{ productId: B, sku: 'SKU-B', name: 'name-SKU-B', requested: 9, available: 5 }],
    });
    expect(await qty(A)).toBe(5);
    expect(await qty(B)).toBe(5);
    expect(await history()).toHaveLength(0);
  });

  it('skips zero net deltas and empty lists', async () => {
    const res = await t.dataSource.transaction((m) =>
      ledger.apply(
        m,
        [
          { productId: A, delta: -2 },
          { productId: A, delta: 2 },
        ],
        ctx,
      ),
    );
    expect(res).toEqual({ ok: true, after: new Map() });
    const empty = await t.dataSource.transaction((m) => ledger.apply(m, [], ctx));
    expect(empty).toEqual({ ok: true, after: new Map() });
    expect(await history()).toHaveLength(0);
  });

  it('locks in productId order (two tx with reversed inputs do not deadlock)', async () => {
    for (let i = 0; i < 5; i++) {
      const run = (ids: string[]) =>
        t.dataSource.transaction(async (m) => {
          const res = await ledger.apply(
            m,
            ids.map((productId) => ({ productId, delta: 1 })),
            ctx,
          );
          await m.query('SELECT pg_sleep(0.05)');
          return res;
        });
      const results = await Promise.all([run([B, A]), run([A, B])]);
      expect(results.every((r) => r.ok)).toBe(true);
    }
    expect(await qty(A)).toBe(15);
    expect(await qty(B)).toBe(15);
  });

  it('unknown productId → AppException 404', async () => {
    const err = await t.dataSource
      .transaction((m) =>
        ledger.apply(m, [{ productId: '00000000-0000-4000-8000-000000000000', delta: 1 }], ctx),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).getStatus()).toBe(404);
    expect((err as AppException).code).toBe('NOT_FOUND');
  });
});
