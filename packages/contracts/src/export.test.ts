import { describe, expect, it } from 'vitest';
import { EXPORT_LIMITS } from './export';
import { ORDER_STATUS_LABEL, OrderStatus } from './order';
import { PRODUCT_STATUS_LABEL, ProductStatus } from './product';

describe('export contract', () => {
  it('EXPORT_LIMITS is maxRows 10000, batchSize 1000', () => {
    expect(EXPORT_LIMITS).toEqual({ maxRows: 10_000, batchSize: 1_000 });
  });

  it('ORDER_STATUS_LABEL and PRODUCT_STATUS_LABEL cover every enum value', () => {
    for (const s of Object.values(OrderStatus)) expect(ORDER_STATUS_LABEL[s]).toBeTruthy();
    for (const s of Object.values(ProductStatus)) expect(PRODUCT_STATUS_LABEL[s]).toBeTruthy();
  });
});
