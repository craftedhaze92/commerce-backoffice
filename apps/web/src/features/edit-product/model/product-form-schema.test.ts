import { describe, expect, it } from 'vitest';
import { ProductStatus } from '@bo/contracts';
import { productDetailFixture } from '@/shared/api/mocks/products';
import { productFormSchema, type ProductFormInput } from './product-form-schema';

const valid: ProductFormInput = {
  sku: ' new-001 ',
  name: '새 상품',
  categoryId: 'cat-1',
  price: '15000',
  status: ProductStatus.DRAFT,
  description: '',
  initialStock: '10',
  safetyStock: '5',
  images: [],
};

function errorsOf(input: ProductFormInput): Record<string, string> {
  const r = productFormSchema.safeParse(input);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('productFormSchema', () => {
  it('normalizes sku and coerces numbers', () => {
    const r = productFormSchema.parse(valid);
    expect(r).toMatchObject({ sku: 'NEW-001', price: 15000, initialStock: 10, safetyStock: 5 });
  });

  it('rejects invalid sku after normalization', () => {
    expect(errorsOf({ ...valid, sku: 'ab' })).toHaveProperty('sku');
    expect(errorsOf({ ...valid, sku: 'ab_c' })).toHaveProperty('sku');
  });

  it('requires name, category and numbers', () => {
    const e = errorsOf({ ...valid, name: ' ', categoryId: '', price: '' });
    expect(e.name).toBe('상품명을 입력하세요');
    expect(e.categoryId).toBe('카테고리를 선택하세요');
    expect(e.price).toBe('가격을 입력하세요');
  });

  it('enforces contract limits', () => {
    const e = errorsOf({
      ...valid,
      name: 'a'.repeat(101),
      description: 'a'.repeat(2001),
      price: '100000001',
      initialStock: '1000001',
      safetyStock: '-1',
    });
    expect(Object.keys(e).sort()).toEqual(
      ['description', 'initialStock', 'name', 'price', 'safetyStock'].sort(),
    );
  });

  it('rejects non-integer numbers', () => {
    expect(errorsOf({ ...valid, price: '10.5' })).toHaveProperty('price');
    expect(errorsOf({ ...valid, price: 'abc' })).toHaveProperty('price');
  });

  it('requires exactly one primary image when images exist', () => {
    const [a, b] = productDetailFixture.images;
    expect(errorsOf({ ...valid, images: [a, b] })).toEqual({});
    expect(errorsOf({ ...valid, images: [{ ...a, isPrimary: false }, b] })).toHaveProperty(
      'images',
    );
    expect(errorsOf({ ...valid, images: [a, { ...b, isPrimary: true }] })).toHaveProperty('images');
  });
});
