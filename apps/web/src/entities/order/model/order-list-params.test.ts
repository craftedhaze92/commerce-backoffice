import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@bo/contracts';
import { toOrderQueryString, type OrderListParams } from './order-list-params';

const defaults: OrderListParams = { page: 1, size: 20, q: '', sort: 'createdAt:desc' };

describe('toOrderQueryString', () => {
  it('omits defaults and empty values', () => {
    expect(toOrderQueryString(defaults)).toBe('');
  });

  it('serializes all set fields in stable order', () => {
    expect(
      toOrderQueryString({
        sort: 'totalAmount:asc',
        to: '2026-02-01',
        from: '2026-01-01',
        status: OrderStatus.SHIPPED,
        q: '김',
        size: 50,
        page: 2,
      }),
    ).toBe(
      'page=2&size=50&q=%EA%B9%80&status=SHIPPED&from=2026-01-01&to=2026-02-01&sort=totalAmount%3Aasc',
    );
  });
});
