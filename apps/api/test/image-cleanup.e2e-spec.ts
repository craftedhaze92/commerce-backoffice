import { Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import request from 'supertest';
import { ProductStatus, Role, type ProductDetail } from '@bo/contracts';
import { createTestApp, type TestApp } from './setup-app.js';
import { pngOf } from './fixtures/images.js';
import { CLOCK } from '../src/common/clock.js';
import { hashPassword } from '../src/common/password.js';
import { Category } from '../src/categories/category.entity.js';
import { ImageCleanupService } from '../src/products/images/image-cleanup.service.js';
import { Product } from '../src/products/product.entity.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../src/storage/object-storage.js';
import { User } from '../src/users/user.entity.js';

const PW = 'demo1234!';
const NOW = new Date('2026-11-25T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);

describe('orphan image cleanup (e2e)', () => {
  let t: TestApp;
  let server: ReturnType<TestApp['app']['getHttpServer']>;
  let cleanup: ImageCleanupService;
  let cookie: string;
  let catId: string;

  beforeAll(async () => {
    t = await createTestApp({ providers: [{ provide: CLOCK, useValue: () => NOW }] });
    server = t.app.getHttpServer();
    cleanup = t.app.get(ImageCleanupService);
  });
  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    const ds = t.dataSource;
    await ds.query('TRUNCATE users, products, categories, product_images RESTART IDENTITY CASCADE');
    catId = (await ds.getRepository(Category).save({ name: '의류' })).id;
    const users = ds.getRepository(User);
    await users.save(
      users.create({
        email: 'manager@demo.com',
        name: 'manager',
        role: Role.MANAGER,
        passwordHash: await hashPassword(PW),
      }),
    );
    const res = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'manager@demo.com', password: PW });
    const raw = res.headers['set-cookie'] as unknown as string[];
    cookie = raw.find((s) => s.startsWith('bo_at='))!.split(';')[0]!;
  });

  /** Uploads a real image through the API; returns its id and both object keys. */
  const upload = async () => {
    const res = await request(server)
      .post('/api/v1/products/images')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'fetch')
      .attach('file', await pngOf(20, 10), 'a.png');
    expect(res.status).toBe(201);
    const body = res.body as { id: string; url: string; thumbUrl: string };
    return {
      id: body.id,
      keys: [body.url, body.thumbUrl].map((u) => u.replace('/media/', '')),
    };
  };
  const objectStatus = async (key: string) =>
    (await fetch(`${t.s3.endpoint}/${t.s3.bucket}/${key}`, { method: 'HEAD' })).status;
  const backdate = (id: string, at: Date) =>
    t.dataSource.query('UPDATE product_images SET "createdAt" = $2 WHERE id = $1', [id, at]);
  const imageRow = async (id: string) =>
    (
      (await t.dataSource.query('SELECT * FROM product_images WHERE id = $1', [id])) as Array<{
        productId: string | null;
      }>
    )[0];
  const insertImage = async (productId: string | null, createdAt: Date) =>
    (
      (await t.dataSource.query(
        `INSERT INTO product_images ("productId", "objectKey", "thumbKey", width, height, "createdAt")
         VALUES ($1, 'k/' || gen_random_uuid(), 't/' || gen_random_uuid(), 10, 10, $2) RETURNING id`,
        [productId, createdAt],
      )) as Array<{ id: string }>
    )[0]!.id;
  let skuSeq = 0;
  const newProduct = async (deletedAt: Date | null = null) => {
    const p = await t.dataSource.getRepository(Product).save({
      sku: `SKU-${++skuSeq}`,
      name: '티셔츠',
      categoryId: catId,
      price: 1000,
      status: ProductStatus.ON_SALE,
    });
    if (deletedAt) {
      await t.dataSource.query('UPDATE products SET "deletedAt" = $2 WHERE id = $1', [
        p.id,
        deletedAt,
      ]);
    }
    return p.id;
  };
  const createProductWith = (imageId: string) =>
    request(server)
      .post('/api/v1/products')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'fetch')
      .send({
        sku: `SKU-API-${++skuSeq}`,
        name: '티셔츠',
        categoryId: catId,
        price: 1000,
        status: ProductStatus.ON_SALE,
        initialStock: 1,
        safetyStock: 0,
        images: [{ id: imageId, isPrimary: true }],
      });

  it('registers the daily cron but does not start it under NODE_ENV=test', () => {
    const job = t.app.get(SchedulerRegistry).getCronJob('image-cleanup');
    expect(job.cronTime.source).toBe('0 0 4 * * *');
    expect(job.isActive).toBe(false);
  });

  it('unattached upload older than 24h -> row and both objects deleted; newer than 24h kept', async () => {
    const old = await upload();
    const fresh = await upload();
    await backdate(old.id, ago(25));
    await backdate(fresh.id, ago(23));

    await expect(cleanup.run()).resolves.toEqual({ deletedRows: 1, deletedKeys: 2 });

    expect(await imageRow(old.id)).toBeUndefined();
    for (const k of old.keys) expect(await objectStatus(k)).toBe(404);
    expect(await imageRow(fresh.id)).toBeDefined();
    for (const k of fresh.keys) expect(await objectStatus(k)).toBe(200);
  });

  it('image detached by PATCH (productId null, created > 24h ago) -> deleted', async () => {
    const img = await upload();
    const created = await createProductWith(img.id);
    expect(created.status).toBe(201);
    const product = created.body as ProductDetail;
    const patched = await request(server)
      .patch(`/api/v1/products/${product.id}`)
      .set('Cookie', cookie)
      .set('X-Requested-With', 'fetch')
      .send({ images: [] });
    expect(patched.status).toBe(200);
    expect((await imageRow(img.id))!.productId).toBeNull();
    await backdate(img.id, ago(48));

    await expect(cleanup.run()).resolves.toEqual({ deletedRows: 1, deletedKeys: 2 });
    expect(await imageRow(img.id)).toBeUndefined();
    for (const k of img.keys) expect(await objectStatus(k)).toBe(404);
  });

  it('image of product soft-deleted > 24h ago -> deleted; soft-deleted < 24h -> kept; live product images kept', async () => {
    const goneLong = await newProduct(ago(25));
    const goneRecently = await newProduct(ago(1));
    const live = await newProduct();
    const img = await upload();
    await t.dataSource.query('UPDATE product_images SET "productId" = $2 WHERE id = $1', [
      img.id,
      goneLong,
    ]);
    // createdAt does not matter for attached images: only the product's deletedAt does.
    const recentOnOld = await insertImage(goneLong, ago(1));
    const keptSoft = await insertImage(goneRecently, ago(100));
    const keptLive = await insertImage(live, ago(100));

    await expect(cleanup.run()).resolves.toEqual({ deletedRows: 2, deletedKeys: 4 });

    expect(await imageRow(img.id)).toBeUndefined();
    expect(await imageRow(recentOnOld)).toBeUndefined();
    for (const k of img.keys) expect(await objectStatus(k)).toBe(404);
    expect(await imageRow(keptSoft)).toBeDefined();
    expect(await imageRow(keptLive)).toBeDefined();
  });

  it('runs in batches of 500 until done (1,001 orphans -> all deleted)', async () => {
    await t.dataSource.query(
      `INSERT INTO product_images ("productId", "objectKey", "thumbKey", width, height, "createdAt")
       SELECT NULL, 'k/' || g, 't/' || g, 10, 10, $1 FROM generate_series(1, 1001) g`,
      [ago(30)],
    );
    const storage = t.app.get<ObjectStorage>(OBJECT_STORAGE);
    const del = vi.spyOn(storage, 'delete');
    try {
      await expect(cleanup.run()).resolves.toEqual({ deletedRows: 1001, deletedKeys: 2002 });
      expect(del.mock.calls.map(([keys]) => keys.length)).toEqual([1000, 1000, 2]);
    } finally {
      del.mockRestore();
    }
    const left = await t.dataSource.query('SELECT count(*)::int AS n FROM product_images');
    expect(left[0].n).toBe(0);
  });

  it('row locked by a concurrent attach (FOR UPDATE held) is skipped, and still attached afterwards', async () => {
    const img = await upload();
    await backdate(img.id, ago(30));
    const productId = await newProduct();

    const qr = t.dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.startTransaction();
      // Same lock lockImages() takes while attaching.
      await qr.query('SELECT id FROM product_images WHERE id = $1 FOR UPDATE', [img.id]);

      await expect(cleanup.run()).resolves.toEqual({ deletedRows: 0, deletedKeys: 0 });

      await qr.query('UPDATE product_images SET "productId" = $2 WHERE id = $1', [
        img.id,
        productId,
      ]);
      await qr.commitTransaction();
    } finally {
      if (qr.isTransactionActive) await qr.rollbackTransaction();
      await qr.release();
    }

    expect((await imageRow(img.id))!.productId).toBe(productId);
    for (const k of img.keys) expect(await objectStatus(k)).toBe(200);
    // Attached to a live product now, so a later run keeps it too.
    await expect(cleanup.run()).resolves.toEqual({ deletedRows: 0, deletedKeys: 0 });
    expect(await imageRow(img.id)).toBeDefined();
  });

  it('when cleanup wins, a later attach fails with 400 and no product points at the image', async () => {
    const img = await upload();
    await backdate(img.id, ago(30));
    await expect(cleanup.run()).resolves.toEqual({ deletedRows: 1, deletedKeys: 2 });

    const res = await createProductWith(img.id);
    expect(res.status).toBe(400);
    const products = await t.dataSource.query('SELECT count(*)::int AS n FROM products');
    expect(products[0].n).toBe(0);
  });

  it('storage delete failure -> rows deleted, warning logged, run resolves', async () => {
    const img = await upload();
    await backdate(img.id, ago(30));
    const storage = t.app.get<ObjectStorage>(OBJECT_STORAGE);
    const del = vi.spyOn(storage, 'delete').mockRejectedValue(new Error('s3 down'));
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await expect(cleanup.run()).resolves.toEqual({ deletedRows: 1, deletedKeys: 0 });
      expect(del).toHaveBeenCalledWith(expect.arrayContaining(img.keys));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain('2');
    } finally {
      del.mockRestore();
      warn.mockRestore();
    }
    expect(await imageRow(img.id)).toBeUndefined();
    // The objects are left behind as harmless orphans.
    for (const k of img.keys) expect(await objectStatus(k)).toBe(200);
  });
});
