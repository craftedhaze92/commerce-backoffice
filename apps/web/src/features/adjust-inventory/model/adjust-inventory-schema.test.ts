import { describe, expect, it } from 'vitest';
import { adjustInventorySchema } from './adjust-inventory-schema';

const parse = (v: Record<string, unknown>) => adjustInventorySchema.safeParse(v);

describe('adjustInventorySchema', () => {
  it('in → positive delta, note trimmed', () => {
    const r = parse({ mode: 'in', amount: '5', note: '  실사  ' });
    expect(r.success && r.data).toEqual({ delta: 5, note: '실사' });
  });

  it('out → negative delta', () => {
    const r = parse({ mode: 'out', amount: '3', note: '파손' });
    expect(r.success && r.data).toEqual({ delta: -3, note: '파손' });
  });

  it.each(['', '0', '-1', '1.5', 'abc', '1000001'])('rejects amount %j', (amount) => {
    expect(parse({ mode: 'in', amount, note: 'x' }).success).toBe(false);
  });

  it('accepts amount 1 and 1_000_000', () => {
    expect(parse({ mode: 'in', amount: '1', note: 'x' }).success).toBe(true);
    expect(parse({ mode: 'in', amount: '1000000', note: 'x' }).success).toBe(true);
  });

  it('rejects blank and >200 char note, accepts 200', () => {
    expect(parse({ mode: 'in', amount: '1', note: '   ' }).success).toBe(false);
    expect(parse({ mode: 'in', amount: '1', note: 'a'.repeat(201) }).success).toBe(false);
    expect(parse({ mode: 'in', amount: '1', note: 'a'.repeat(200) }).success).toBe(true);
  });
});
