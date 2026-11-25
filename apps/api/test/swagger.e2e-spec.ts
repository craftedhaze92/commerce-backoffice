import type { OpenAPIObject } from '@nestjs/swagger';
import { buildSwaggerDocument } from '../src/swagger.js';
import { createTestApp, type TestApp } from './setup-app.js';

const TAGS = [
  'auth',
  'users',
  'categories',
  'products',
  'product-images',
  'inventory',
  'orders',
  'dashboard',
  'health',
];
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('swagger document (e2e)', () => {
  let t: TestApp;
  let doc: OpenAPIObject;

  beforeAll(async () => {
    t = await createTestApp();
    doc = buildSwaggerDocument(t.app);
  });
  afterAll(async () => {
    await t?.stop();
  });

  it('every path has at least one tag from the fixed tag list', () => {
    const missing: string[] = [];
    for (const [path, item] of Object.entries(doc.paths)) {
      for (const m of METHODS) {
        const op = item[m];
        if (op && !(op.tags ?? []).some((tag) => TAGS.includes(tag))) missing.push(`${m} ${path}`);
      }
    }
    expect(missing).toEqual([]);
    expect(Object.keys(doc.paths).length).toBeGreaterThan(20);
  });

  it('no /api/v1/dev/* paths', () => {
    expect(Object.keys(doc.paths).filter((p) => p.startsWith('/api/v1/dev'))).toEqual([]);
  });

  it.each(['/api/v1/products/export', '/api/v1/orders/export'])(
    'export %s produces xlsx',
    (path) => {
      const op = doc.paths[path]?.get;
      expect(op).toBeDefined();
      const ok = (op!.responses['200'] as { content?: Record<string, unknown> }).content;
      expect(Object.keys(ok ?? {})).toEqual([XLSX]);
    },
  );

  it.each(['/api/v1/dashboard/sales-trend', '/api/v1/dashboard/category-sales'])(
    'dashboard days query param has enum [7, 30, 90] (%s)',
    (path) => {
      const params = (doc.paths[path]?.get?.parameters ?? []) as Array<{
        name: string;
        in: string;
        schema?: { enum?: number[] };
      }>;
      const days = params.find((p) => p.name === 'days' && p.in === 'query');
      expect(days?.schema?.enum).toEqual([7, 30, 90]);
    },
  );

  it('components.schemas has ApiErrorBody', () => {
    expect(doc.components?.schemas?.['ApiErrorBody']).toBeDefined();
  });

  it('inventory endpoints are tagged inventory', () => {
    expect(doc.paths['/api/v1/products/{id}/inventory']?.patch?.tags).toEqual(['inventory']);
    expect(doc.paths['/api/v1/products/{id}/inventory-history']?.get?.tags).toEqual(['inventory']);
  });
});
