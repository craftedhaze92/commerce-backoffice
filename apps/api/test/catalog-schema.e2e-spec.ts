import { QueryFailedError, type DataSource } from 'typeorm';
import { ProductStatus } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { Category } from '../src/categories/category.entity.js';
import { Inventory } from '../src/products/inventory.entity.js';
import { ProductImage } from '../src/products/product-image.entity.js';
import { Product } from '../src/products/product.entity.js';

async function pgCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof QueryFailedError) {
      return (err.driverError as { code?: string }).code;
    }
    throw err;
  }
  return undefined;
}

describe('catalog schema (e2e)', () => {
  let t: TestApp;
  let ds: DataSource;
  let categoryId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.dataSource;
  });

  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    await ds.query('TRUNCATE products, categories RESTART IDENTITY CASCADE');
    const category = await ds.getRepository(Category).save({ name: '의류' });
    categoryId = category.id;
  });

  const makeProduct = (sku: string, quantity = 5) =>
    ds.transaction(async (m) => {
      const product = await m.save(
        m.create(Product, {
          sku,
          name: '상품',
          categoryId,
          price: 1000,
          status: ProductStatus.DRAFT,
        }),
      );
      await m.save(m.create(Inventory, { productId: product.id, quantity, safetyStock: 10 }));
      return product;
    });

  it('applies column defaults', async () => {
    const p = await makeProduct('SKU-001');
    const row = await ds.getRepository(Product).findOneByOrFail({ id: p.id });
    expect(row.description).toBe('');
    expect(row.deletedAt).toBeNull();
    await ds.query('DELETE FROM inventories WHERE "productId" = $1', [p.id]);
    await ds.getRepository(Inventory).insert({ productId: p.id, quantity: 1 });
    const inv = await ds.getRepository(Inventory).findOneByOrFail({ productId: p.id });
    expect(inv.safetyStock).toBe(0);
  });

  it('rejects negative inventory via CHECK', async () => {
    const p = await makeProduct('SKU-001');
    const code = await pgCode(
      ds.query('UPDATE inventories SET quantity = -1 WHERE "productId" = $1', [p.id]),
    );
    expect(code).toBe('23514');
  });

  it('rejects negative safetyStock and price via CHECK', async () => {
    const p = await makeProduct('SKU-001');
    expect(
      await pgCode(
        ds.query('UPDATE inventories SET "safetyStock" = -1 WHERE "productId" = $1', [p.id]),
      ),
    ).toBe('23514');
    expect(await pgCode(ds.query('UPDATE products SET price = -1 WHERE id = $1', [p.id]))).toBe(
      '23514',
    );
  });

  it('sku is normalized and unique among live products', async () => {
    const first = await makeProduct(' sku-001 ');
    const row = await ds.getRepository(Product).findOneByOrFail({ id: first.id });
    expect(row.sku).toBe('SKU-001');
    expect(await pgCode(makeProduct('sku-001'))).toBe('23505');
  });

  it('soft-deleted sku can be reused', async () => {
    const first = await makeProduct('SKU-001');
    await ds.getRepository(Product).softRemove(first);
    const second = await makeProduct('SKU-001');
    expect(second.id).not.toBe(first.id);
  });

  it('deleting a product cascades inventory and images', async () => {
    const p = await makeProduct('SKU-001');
    await ds.getRepository(ProductImage).save({
      productId: p.id,
      objectKey: 'k/1',
      thumbKey: 'k/1-t',
      width: 10,
      height: 10,
    });
    await ds.query('DELETE FROM products WHERE id = $1', [p.id]);
    expect(await ds.getRepository(Inventory).count()).toBe(0);
    expect(await ds.getRepository(ProductImage).count()).toBe(0);
  });

  it('restricts deleting a category that has products', async () => {
    await makeProduct('SKU-001');
    expect(await pgCode(ds.query('DELETE FROM categories WHERE id = $1', [categoryId]))).toBe(
      '23503',
    );
  });
});
