import { describe, expect, it } from 'vitest';
import { productListSchema } from './product-list-params';

const parse = (qs: string) => productListSchema.parse(Object.fromEntries(new URLSearchParams(qs)));

const defaults = {
  page: 1,
  size: 20,
  q: '',
  lowStock: false,
  sort: 'createdAt:desc',
};

describe('productListSchema', () => {
  it('sanitizes ?page=abc&sort=password:asc&status=FOO&minPrice=-1 to defaults', () => {
    const r = parse('page=abc&sort=password:asc&status=FOO&minPrice=-1');
    expect(r).toMatchObject(defaults);
    expect(r.status).toBeUndefined();
    expect(r.minPrice).toBeUndefined();
  });

  it('falls back on every other malformed value', () => {
    const r = parse(
      `page=0&size=7&q=${'a'.repeat(51)}&categoryId=not-a-uuid&maxPrice=1.5&lowStock=1&sort=name:up`,
    );
    expect(r).toMatchObject(defaults);
    expect(r.categoryId).toBeUndefined();
    expect(r.maxPrice).toBeUndefined();
  });

  it('rejects prices over the limit and empty price strings', () => {
    expect(parse('maxPrice=100000001').maxPrice).toBeUndefined();
    expect(parse('minPrice=').minPrice).toBeUndefined();
    expect(parse('maxPrice=100000000').maxPrice).toBe(100_000_000);
  });

  it('accepts valid values', () => {
    const id = '00000000-0000-4000-8000-c00000000001';
    const r = parse(
      `page=3&size=50&q=신발&categoryId=${id}&status=ON_SALE&minPrice=0&maxPrice=5000&lowStock=true&sort=price:asc`,
    );
    expect(r).toEqual({
      page: 3,
      size: 50,
      q: '신발',
      categoryId: id,
      status: 'ON_SALE',
      minPrice: 0,
      maxPrice: 5000,
      lowStock: true,
      sort: 'price:asc',
    });
  });

  it('minPrice > maxPrice drops both', () => {
    const r = parse('minPrice=9000&maxPrice=1000');
    expect(r.minPrice).toBeUndefined();
    expect(r.maxPrice).toBeUndefined();
  });

  it('keeps minPrice == maxPrice', () => {
    expect(parse('minPrice=1000&maxPrice=1000')).toMatchObject({ minPrice: 1000, maxPrice: 1000 });
  });
});
