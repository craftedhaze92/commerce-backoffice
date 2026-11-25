import ExcelJS from 'exceljs';
import request from 'supertest';
import {
  PRODUCT_STATUS_LABEL,
  ProductStatus,
  Role,
  type Paginated,
  type ProductListItem,
} from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { getXlsx } from './helpers/xlsx.js';
import { hashPassword } from '../src/auth/password.js';
import { Category } from '../src/categories/category.entity.js';
import { CLOCK } from '../src/common/clock.js';
import { Inventory } from '../src/products/inventory.entity.js';
import { Product } from '../src/products/product.entity.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const URL = '/api/v1/products/export';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// 2026-11-21 00:30 KST (UTC date would be 11-20)
const NOW = new Date('2026-11-20T15:30:00Z');

describe('products export (e2e)', () => {
  let t: TestApp;
  let cookies: Record<string, string>;
  let cat: { a: string; b: string };

  beforeAll(async () => {
    t = await createTestApp({ providers: [{ provide: CLOCK, useValue: () => NOW }] });
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
  const listAll = async (qs: string): Promise<ProductListItem[]> => {
    const items: ProductListItem[] = [];
    for (let page = 1; ; page++) {
      const body = (await get(`/api/v1/products${qs}&page=${page}&size=2`))
        .body as Paginated<ProductListItem>;
      items.push(...body.items);
      if (page >= body.meta.totalPages) break;
    }
    return items;
  };

  it('manager 200: filename*=상품목록_20261121.xlsx, ascii products_20261121.xlsx', async () => {
    const { res, workbook } = await exportXlsx();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(XLSX_TYPE);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="products_20261121.xlsx"; filename*=UTF-8''${encodeURIComponent('상품목록_20261121.xlsx')}`,
    );
    const ws = workbook.getWorksheet('상품')!;
    expect(ws).toBeDefined();
    expect((ws.getRow(1).values as ExcelJS.CellValue[]).slice(1)).toEqual([
      'SKU',
      '상품명',
      '카테고리',
      '판매가',
      '상태',
      '재고',
      '안전재고',
      '재고부족',
      '등록일시',
    ]);
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.rowCount).toBe(1);
  });

  it('rows equal GET /products (all pages, same query) in order — q + categoryId + status + minPrice/maxPrice + lowStock + sort=price:asc', async () => {
    for (let i = 1; i <= 9; i++) {
      await make({
        sku: `SKU-${i}`,
        name: `셔츠 ${i}`,
        categoryId: i % 4 ? cat.a : cat.b,
        price: 1000 * ((i * 3) % 4) + 500, // ties on price
        status: i % 5 ? ProductStatus.ON_SALE : ProductStatus.HIDDEN,
        quantity: i % 3,
        safetyStock: 1,
      });
    }
    await make({ sku: 'OTHER-1', name: '모자', price: 1500, quantity: 0, safetyStock: 1 });
    const qs = `?q=SKU&categoryId=${cat.a}&status=ON_SALE&minPrice=500&maxPrice=3500&lowStock=true&sort=price:asc`;
    const expected = await listAll(qs);
    expect(expected.length).toBeGreaterThan(2);
    const { workbook } = await exportXlsx(qs);
    const rows = sheetRows(workbook.getWorksheet('상품')!);
    expect(rows.map((r) => r[0])).toEqual(expected.map((e) => e.sku));
    expect(rows.map((r) => r[3])).toEqual(expected.map((e) => e.price));
  });

  it('soft-deleted product is excluded from both', async () => {
    await make({ sku: 'LIVE-1' });
    await make({ sku: 'GONE-1', deleted: true });
    const expected = await listAll('?sort=name:asc');
    expect(expected.map((e) => e.sku)).toEqual(['LIVE-1']);
    const { workbook } = await exportXlsx('?sort=name:asc');
    expect(sheetRows(workbook.getWorksheet('상품')!).map((r) => r[0])).toEqual(['LIVE-1']);
  });

  it('price #,##0 number; stock/safetyStock numbers; 재고부족 Y/N; status label 판매중', async () => {
    await make({
      sku: 'A-1',
      name: '티셔츠',
      categoryId: cat.b,
      price: 1234567,
      quantity: 2,
      safetyStock: 5,
      createdAt: new Date('2026-11-20T15:30:00Z'),
    });
    await make({ sku: 'A-2', price: 100, quantity: 9, safetyStock: 5 });
    const { workbook } = await exportXlsx('?sort=price:desc');
    const ws = workbook.getWorksheet('상품')!;
    const low = ws.getRow(2);
    expect((low.values as ExcelJS.CellValue[]).slice(1)).toEqual([
      'A-1',
      '티셔츠',
      '식품',
      1234567,
      '판매중',
      2,
      5,
      'Y',
      '2026-11-21 00:30',
    ]);
    expect(low.getCell(5).value).toBe(PRODUCT_STATUS_LABEL[ProductStatus.ON_SALE]);
    expect(low.getCell(4).numFmt).toBe('#,##0');
    expect(low.getCell(6).type).toBe(ExcelJS.ValueType.Number);
    expect(low.getCell(7).type).toBe(ExcelJS.ValueType.Number);
    expect(ws.getRow(3).getCell(8).value).toBe('N');
  });

  it('product name "+cmd" is a string cell', async () => {
    await make({ sku: 'F-1', name: '+cmd' });
    const { workbook } = await exportXlsx();
    const cell = workbook.getWorksheet('상품')!.getRow(2).getCell(2);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.value).toBe('+cmd');
  });

  it('minPrice > maxPrice → 400 (same as list)', async () => {
    const res = await get(`${URL}?minPrice=500&maxPrice=100`);
    const list = await get('/api/v1/products?minPrice=500&maxPrice=100');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toEqual(list.body);
  });

  it('viewer 403; no cookie 401; GET /products/:uuid still works (route order)', async () => {
    expect((await get(URL, 'viewer')).status).toBe(403);
    expect((await request(t.app.getHttpServer()).get(URL)).status).toBe(401);
    const p = await make({ sku: 'D-1' });
    const detail = await get(`/api/v1/products/${p.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.sku).toBe('D-1');
  });
});
