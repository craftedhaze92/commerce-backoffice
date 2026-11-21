import { describe, expect, it } from 'vitest';
import { ProductStatus } from '@bo/contracts';
import { toProductQueryString, type ProductListParams } from './product-list-params';

const defaults: ProductListParams = {
  page: 1,
  size: 20,
  q: '',
  lowStock: false,
  sort: 'createdAt:desc',
};

describe('toProductQueryString', () => {
  it('omits defaults: page 1,size 20,q "",lowStock false,sort createdAt:desc → ""', () => {
    expect(toProductQueryString(defaults)).toBe('');
  });

  it('serializes all set fields in stable order', () => {
    expect(
      toProductQueryString({
        sort: 'price:asc',
        lowStock: true,
        maxPrice: 50000,
        minPrice: 1000,
        status: ProductStatus.ON_SALE,
        categoryId: 'cat-1',
        q: '셔츠 A',
        size: 50,
        page: 3,
      }),
    ).toBe(
      'page=3&size=50&q=%EC%85%94%EC%B8%A0+A&categoryId=cat-1&status=ON_SALE&minPrice=1000&maxPrice=50000&lowStock=true&sort=price%3Aasc',
    );
  });

  it('keeps a zero minPrice', () => {
    expect(toProductQueryString({ ...defaults, minPrice: 0 })).toBe('minPrice=0');
  });
});
