import { describe, expect, it } from 'vitest';
import { toPaginated } from './pagination.js';

describe('toPaginated', () => {
  it('computes totalPages (0 when empty)', () => {
    expect(toPaginated([1, 2], 5, 1, 2).meta).toEqual({
      page: 1,
      size: 2,
      total: 5,
      totalPages: 3,
    });
    expect(toPaginated([], 0, 1, 20).meta.totalPages).toBe(0);
  });

  it('keeps items as given', () => {
    expect(toPaginated(['a'], 1, 1, 20).items).toEqual(['a']);
  });
});
