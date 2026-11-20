import { describe, expect, it } from 'vitest';
import { AppException } from './app-exception.js';
import { parseSort } from './sort.js';

const F = ['name', 'createdAt'] as const;
const FB = { field: 'createdAt', dir: 'desc' } as const;

describe('parseSort', () => {
  it('returns fallback when undefined', () => {
    expect(parseSort(undefined, F, FB)).toEqual(FB);
  });

  it('parses name:asc', () => {
    expect(parseSort('name:asc', F, FB)).toEqual({ field: 'name', dir: 'asc' });
  });

  it.each(['password:asc', 'name', 'name:up', 'name:asc:x', '', 'name:ASC', ' name:asc'])(
    'rejects %s',
    (raw) => {
      expect(() => parseSort(raw, F, FB)).toThrow(AppException);
    },
  );

  it('reports 400 VALIDATION_FAILED with sort details', () => {
    try {
      parseSort('x:asc', F, FB);
      expect.unreachable();
    } catch (e) {
      const ex = e as AppException;
      expect(ex.getStatus()).toBe(400);
      expect(ex.code).toBe('VALIDATION_FAILED');
      expect(ex.details).toEqual([{ field: 'sort', messages: [expect.any(String)] }]);
    }
  });
});
