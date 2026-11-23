import { describe, expect, it } from 'vitest';
import {
  ProductStatus,
  type Category,
  type Paginated,
  type ProductDetail,
  type ProductImage,
  type ProductListItem,
} from '@bo/contracts';
import { http } from '@/shared/api';
import { categoryFixtures, productDetailFixture, productFixtures } from './products';

describe('productHandlers', () => {
  it('paginates and filters by q', async () => {
    const p1 = await http<Paginated<ProductListItem>>('/products?page=2&size=10');
    expect(p1.items).toHaveLength(10);
    expect(p1.meta).toEqual({ page: 2, size: 10, total: 25, totalPages: 3 });
    const q = await http<Paginated<ProductListItem>>(
      `/products?q=${productFixtures[0].sku.toLowerCase()}`,
    );
    expect(q.items.map((i) => i.id)).toContain(productFixtures[0].id);
  });

  it('filters by status', async () => {
    const res = await http<Paginated<ProductListItem>>('/products?status=SOLD_OUT');
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((i) => i.status === ProductStatus.SOLD_OUT)).toBe(true);
  });

  it('lists categories', async () => {
    expect(await http<Category[]>('/categories')).toEqual(categoryFixtures);
  });

  it('returns detail for a known id', async () => {
    const res = await http<ProductDetail>(`/products/${productDetailFixture.id}`);
    expect(res.images).toHaveLength(2);
  });

  it('returns 404 for unknown id', async () => {
    await expect(http('/products/00000000-0000-4000-8000-0000000000ff')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('upload returns a fresh image each time', async () => {
    const a = await http<ProductImage>('/products/images', {
      method: 'POST',
      body: new FormData(),
    });
    const b = await http<ProductImage>('/products/images', {
      method: 'POST',
      body: new FormData(),
    });
    expect(a.id).not.toBe(b.id);
  });
});
