import { describe, expect, it } from 'vitest';
import {
  normalizeSku,
  PRODUCT_LIMITS,
  PRODUCT_SORT_FIELDS,
  ProductStatus,
  SKU_PATTERN,
} from './product';

describe('product', () => {
  it('normalizeSku trims and uppercases', () => {
    expect(normalizeSku('  sku-001 ')).toBe('SKU-001');
  });

  it.each([
    ['SKU-001', true],
    ['ab', false],
    ['SKU_001', false],
    ['A'.repeat(33), false],
  ])('SKU_PATTERN %s -> %s', (value, ok) => {
    expect(SKU_PATTERN.test(value)).toBe(ok);
  });

  it('PRODUCT_SORT_FIELDS is the whitelist', () => {
    expect(PRODUCT_SORT_FIELDS).toEqual(['createdAt', 'updatedAt', 'name', 'price', 'stock']);
  });

  it('ProductStatus has the four storefront states', () => {
    expect(ProductStatus).toEqual({
      DRAFT: 'DRAFT',
      ON_SALE: 'ON_SALE',
      SOLD_OUT: 'SOLD_OUT',
      HIDDEN: 'HIDDEN',
    });
  });

  it('PRODUCT_LIMITS matches the agreed limits', () => {
    expect(PRODUCT_LIMITS).toEqual({
      maxPrice: 100_000_000,
      maxStock: 1_000_000,
      nameMax: 100,
      descriptionMax: 2000,
      imageMaxBytes: 5 * 1024 * 1024,
      imageMaxCount: 10,
      imageMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    });
  });
});
