import { describe, expect, it } from 'vitest';
import { changeRate, REVENUE_STATUSES } from './dashboard';
import { OrderStatus } from './order';

describe('dashboard contract', () => {
  it('REVENUE_STATUSES is exactly CONFIRMED·SHIPPED·DELIVERED', () => {
    expect([...REVENUE_STATUSES]).toEqual([
      OrderStatus.CONFIRMED,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ]);
  });

  it('changeRate computes percent change and null when previous is 0', () => {
    expect(changeRate(150, 100)).toBe(50);
    expect(changeRate(50, 100)).toBe(-50);
    expect(changeRate(0, 0)).toBeNull();
    expect(changeRate(10, 0)).toBeNull();
  });
});
