import { describe, expect, it } from 'vitest';
import type { Paginated, ProductListItem } from '@bo/contracts';
import { http } from '@/shared/api';
import { productFixtures } from './products';

describe('productHandlers', () => {
  it('paginates and filters by q/status', async () => {
    const p1 = await http<Paginated<ProductListItem>>('/products?page=2&size=10');
    expect(p1.items).toHaveLength(10);
    expect(p1.meta).toEqual({ page: 2, size: 10, total: 25, totalPages: 3 });
    const q = await http<Paginated<ProductListItem>>(
      `/products?q=${productFixtures[0].sku.toLowerCase()}`,
    );
    expect(q.items.map((i) => i.id)).toContain(productFixtures[0].id);
  });

  it('returns 404 for unknown id', async () => {
    await expect(http('/products/00000000-0000-4000-8000-0000000000ff')).rejects.toMatchObject({
      status: 404,
    });
  });
});
