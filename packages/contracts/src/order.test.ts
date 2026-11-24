import { describe, expect, it } from 'vitest';
import {
  availableActions,
  canTransition,
  nextStatus,
  OrderStatus,
  ORDER_LIMITS,
  ORDER_SORT_FIELDS,
  ORDER_TRANSITIONS,
} from './order';

describe('order state machine', () => {
  it.each([
    ['PENDING', 'CONFIRMED', true],
    ['CONFIRMED', 'SHIPPED', true],
    ['SHIPPED', 'DELIVERED', true],
    ['PENDING', 'CANCELLED', true],
    ['CONFIRMED', 'CANCELLED', true],
    ['SHIPPED', 'CANCELLED', false],
    ['DELIVERED', 'CANCELLED', false],
    ['PENDING', 'SHIPPED', false],
    ['CANCELLED', 'CONFIRMED', false],
    ['CONFIRMED', 'CONFIRMED', false],
  ])('canTransition(%s, %s) = %s', (f, t, ok) =>
    expect(canTransition(f as OrderStatus, t as OrderStatus)).toBe(ok),
  );

  it('availableActions', () => {
    expect(availableActions(OrderStatus.PENDING)).toEqual(['confirm', 'cancel']);
    expect(availableActions(OrderStatus.CONFIRMED)).toEqual(['ship', 'cancel']);
    expect(availableActions(OrderStatus.SHIPPED)).toEqual(['deliver']);
    expect(availableActions(OrderStatus.DELIVERED)).toEqual([]);
    expect(availableActions(OrderStatus.CANCELLED)).toEqual([]);
  });

  it('nextStatus returns null for disallowed action', () =>
    expect(nextStatus(OrderStatus.SHIPPED, 'cancel')).toBeNull());

  it('nextStatus returns the target for allowed action', () => {
    expect(nextStatus(OrderStatus.PENDING, 'confirm')).toBe(OrderStatus.CONFIRMED);
    expect(nextStatus(OrderStatus.CONFIRMED, 'cancel')).toBe(OrderStatus.CANCELLED);
  });

  it('ORDER_TRANSITIONS matches the spec', () => {
    expect(ORDER_TRANSITIONS).toEqual({
      confirm: { from: [OrderStatus.PENDING], to: OrderStatus.CONFIRMED },
      ship: { from: [OrderStatus.CONFIRMED], to: OrderStatus.SHIPPED },
      deliver: { from: [OrderStatus.SHIPPED], to: OrderStatus.DELIVERED },
      cancel: {
        from: [OrderStatus.PENDING, OrderStatus.CONFIRMED],
        to: OrderStatus.CANCELLED,
      },
    });
  });

  it('OrderStatus has five states as string enum', () => {
    expect(OrderStatus).toEqual({
      PENDING: 'PENDING',
      CONFIRMED: 'CONFIRMED',
      SHIPPED: 'SHIPPED',
      DELIVERED: 'DELIVERED',
      CANCELLED: 'CANCELLED',
    });
  });

  it('ORDER_SORT_FIELDS is the whitelist', () => {
    expect(ORDER_SORT_FIELDS).toEqual(['createdAt', 'totalAmount']);
  });

  it('ORDER_LIMITS', () => {
    expect(ORDER_LIMITS).toEqual({ qMax: 50, randomMax: 50 });
  });
});
