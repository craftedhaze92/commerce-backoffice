import { describe, expect, it } from 'vitest';
import { INVENTORY_LIMITS, InventoryChangeReason } from './inventory';

describe('inventory', () => {
  it('InventoryChangeReason is a string enum', () => {
    expect(InventoryChangeReason).toEqual({
      ORDER_CONFIRM: 'ORDER_CONFIRM',
      ORDER_CANCEL: 'ORDER_CANCEL',
      MANUAL_ADJUST: 'MANUAL_ADJUST',
    });
  });

  it('INVENTORY_LIMITS', () => {
    expect(INVENTORY_LIMITS).toEqual({ deltaMax: 1_000_000, noteMax: 200 });
  });
});
