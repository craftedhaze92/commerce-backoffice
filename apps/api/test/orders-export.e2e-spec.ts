import ExcelJS from 'exceljs';
import request from 'supertest';
import {
  EXPORT_LIMITS,
  ORDER_STATUS_LABEL,
  OrderStatus,
  Role,
  type OrderListItem,
  type Paginated,
} from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { getXlsx } from './helpers/xlsx.js';
import { hashPassword } from '../src/common/password.js';
import { CLOCK } from '../src/common/clock.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/orders/export';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// 2026-11-21 00:30 KST (UTC date would be 11-20)
const NOW = new Date('2026-11-20T15:30:00Z');

describe('orders export (e2e)', () => {
  let t: TestApp;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    t = await createTestApp({ providers: [{ provide: CLOCK, useValue: () => NOW }] });
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
    confirmedAt?: string | null;
  }): Promise<string> {
    const rows = (await t.dataSource.query(
      `INSERT INTO orders ("orderNo","customerName",status,"totalAmount","createdAt","confirmedAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$5) RETURNING id`,
      [
        o.no,
        o.customer ?? '홍길동',
        o.status ?? 'PENDING',
        o.total ?? 1000,
        o.createdAt,
        o.confirmedAt ?? null,
      ],
    )) as Array<{ id: string }>;
    return rows[0]!.id;
  }

  async function insertMany(n: number): Promise<void> {
    await t.dataSource.query(
      `INSERT INTO orders ("orderNo","customerName",status,"totalAmount","createdAt","updatedAt")
       SELECT 'ORD-' || lpad(g::text, 6, '0'), 'c' || g, 'PENDING', 1000, now(), now()
       FROM generate_series(1, $1::int) g`,
      [n],
    );
  }

  beforeEach(async () => {
    const ds = t.dataSource;
    await ds.query(
      'TRUNCATE users, products, categories, orders, order_sequences RESTART IDENTITY CASCADE',
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
  const exportXlsx = (qs = '') => getXlsx(get(`${URL}${qs}`));
  const sheetRows = (ws: ExcelJS.Worksheet): ExcelJS.CellValue[][] => {
    const rows: ExcelJS.CellValue[][] = [];
    ws.eachRow((row, n) => {
      if (n > 1) rows.push((row.values as ExcelJS.CellValue[]).slice(1));
    });
    return rows;
  };

  it('manager 200: xlsx content-type, no-store, KST filename (한글 + ascii)', async () => {
    const { res } = await exportXlsx();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(XLSX_TYPE);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="orders_20261121.xlsx"; filename*=UTF-8''${encodeURIComponent('주문목록_20261121.xlsx')}`,
    );
  });

  it('sheet 주문: bold frozen header in the specified column order', async () => {
    const { workbook } = await exportXlsx();
    const ws = workbook.getWorksheet('주문')!;
    expect(ws).toBeDefined();
    expect((ws.getRow(1).values as ExcelJS.CellValue[]).slice(1)).toEqual([
      '주문번호',
      '고객명',
      '상태',
      '품목 수',
      '주문금액',
      '접수일시',
      '확정일시',
      '취소일시',
    ]);
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('rows equal GET /orders (all pages, same query) in the same order', async () => {
    for (let i = 1; i <= 7; i++) {
      await insertOrder({
        no: `ORD-${i}`,
        customer: i % 2 ? '김철수' : '박영희',
        status: i % 3 ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
        total: 1000 * ((i * 3) % 4) + 500, // ties on totalAmount
        createdAt: `2026-11-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
      });
    }
    // Boundary rows for the KST day range: 11-14T15:00Z is KST 11-15 00:00
    await insertOrder({
      no: 'ORD-EDGE',
      status: OrderStatus.CONFIRMED,
      total: 1500,
      createdAt: '2026-11-14T15:00:00Z',
    });
    const qs = '?status=CONFIRMED&from=2026-11-12&to=2026-11-17&q=ORD&sort=totalAmount:asc';
    const expected: OrderListItem[] = [];
    for (let page = 1; ; page++) {
      const body = (await get(`/api/v1/orders${qs}&page=${page}&size=2`))
        .body as Paginated<OrderListItem>;
      expected.push(...body.items);
      if (page >= body.meta.totalPages) break;
    }
    expect(expected.length).toBeGreaterThan(2);
    const { workbook } = await exportXlsx(qs);
    const rows = sheetRows(workbook.getWorksheet('주문')!);
    expect(rows.map((r) => r[0])).toEqual(expected.map((e) => e.orderNo));
    expect(rows.map((r) => r[4])).toEqual(expected.map((e) => e.totalAmount));
  });

  it('amount is number with #,##0; dates KST strings; empty 확정일시 for PENDING; status label', async () => {
    await insertOrder({
      no: 'ORD-1',
      status: OrderStatus.CONFIRMED,
      total: 1234567,
      createdAt: '2026-11-20T15:30:00Z',
      confirmedAt: '2026-11-20T16:00:00Z',
    });
    await insertOrder({ no: 'ORD-2', createdAt: '2026-11-10T00:00:00Z' });
    const { workbook } = await exportXlsx('?sort=totalAmount:desc');
    const ws = workbook.getWorksheet('주문')!;
    const confirmed = ws.getRow(2);
    expect(confirmed.getCell(3).value).toBe(ORDER_STATUS_LABEL[OrderStatus.CONFIRMED]);
    expect(confirmed.getCell(3).value).toBe('확정');
    expect(confirmed.getCell(5).value).toBe(1234567);
    expect(confirmed.getCell(5).numFmt).toBe('#,##0');
    expect(confirmed.getCell(6).value).toBe('2026-11-21 00:30');
    expect(confirmed.getCell(7).value).toBe('2026-11-21 01:00');
    const pending = ws.getRow(3);
    expect(pending.getCell(3).value).toBe(ORDER_STATUS_LABEL[OrderStatus.PENDING]);
    expect(pending.getCell(7).value ?? '').toBe('');
    expect(pending.getCell(8).value ?? '').toBe('');
  });

  it('customer name "=HYPERLINK(...)" is a string cell', async () => {
    const name = '=HYPERLINK("http://x","y")';
    await insertOrder({ no: 'ORD-F', customer: name, createdAt: '2026-11-10T00:00:00Z' });
    const { workbook } = await exportXlsx();
    const cell = workbook.getWorksheet('주문')!.getRow(2).getCell(2);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe(name);
  });

  it('exactly 10,000 rows → file with 10,000 data rows', async () => {
    await insertMany(EXPORT_LIMITS.maxRows);
    const { res, workbook } = await exportXlsx();
    expect(res.status).toBe(200);
    expect(workbook.getWorksheet('주문')!.rowCount).toBe(EXPORT_LIMITS.maxRows + 1);
  }, 60_000);

  it('10,001 rows → 422 EXPORT_TOO_LARGE with JSON body', async () => {
    await insertMany(EXPORT_LIMITS.maxRows + 1);
    const res = await get(URL);
    expect(res.status).toBe(422);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.body).toMatchObject({
      statusCode: 422,
      code: 'EXPORT_TOO_LARGE',
      details: { total: 10001, maxRows: 10000 },
    });
  }, 60_000);

  it('0 rows → header-only file', async () => {
    const { res, workbook } = await exportXlsx();
    expect(res.status).toBe(200);
    expect(workbook.getWorksheet('주문')!.rowCount).toBe(1);
  });

  it('page/size are ignored (size=5 still exports all matching rows)', async () => {
    for (let i = 1; i <= 8; i++) {
      await insertOrder({ no: `ORD-${i}`, createdAt: `2026-11-0${i}T00:00:00Z` });
    }
    const { workbook } = await exportXlsx('?page=2&size=5');
    expect(workbook.getWorksheet('주문')!.rowCount).toBe(9);
  });

  it.each(['status=X', 'from=2026-13-01', 'sort=foo:asc'])('400 for %s', async (qs) => {
    const res = await get(`${URL}?${qs}`);
    expect(res.status).toBe(400);
  });

  it('viewer 403; no cookie 401; GET /orders/:uuid still works', async () => {
    expect((await get(URL, 'viewer')).status).toBe(403);
    expect((await request(t.app.getHttpServer()).get(URL)).status).toBe(401);
    const id = await insertOrder({ no: 'ORD-D', createdAt: '2026-11-10T00:00:00Z' });
    const detail = await get(`/api/v1/orders/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.orderNo).toBe('ORD-D');
  });
});
