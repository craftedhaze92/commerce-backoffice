import { describe, expect, it } from 'vitest';
import { orderListSchema } from './order-list-params';

const parse = (qs: string) => orderListSchema.parse(Object.fromEntries(new URLSearchParams(qs)));

describe('orderListSchema', () => {
  it('sanitizes ?status=X&from=2026-13-01&to=abc&page=-1 to defaults', () => {
    const r = parse('status=X&from=2026-13-01&to=abc&page=-1');
    expect(r).toEqual({ page: 1, size: 20, q: '', sort: 'createdAt:desc' });
  });

  it('falls back on other malformed values', () => {
    const r = parse(`size=7&q=${'a'.repeat(51)}&sort=name:up`);
    expect(r).toEqual({ page: 1, size: 20, q: '', sort: 'createdAt:desc' });
  });

  it('accepts valid values', () => {
    expect(
      parse(
        'page=3&size=50&q=김&status=CONFIRMED&from=2026-11-01&to=2026-11-20&sort=totalAmount:asc',
      ),
    ).toEqual({
      page: 3,
      size: 50,
      q: '김',
      status: 'CONFIRMED',
      from: '2026-11-01',
      to: '2026-11-20',
      sort: 'totalAmount:asc',
    });
  });

  it('from > to drops both', () => {
    const r = parse('from=2026-11-20&to=2026-11-01');
    expect(r.from).toBeUndefined();
    expect(r.to).toBeUndefined();
  });

  it('keeps a single-sided range', () => {
    expect(parse('from=2026-11-01').from).toBe('2026-11-01');
    expect(parse('to=2026-11-01').to).toBe('2026-11-01');
  });
});
