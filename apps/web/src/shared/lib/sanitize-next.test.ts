import { describe, expect, it } from 'vitest';
import { sanitizeNext } from './sanitize-next';

describe('sanitizeNext', () => {
  it.each([
    ['/orders?status=PENDING', '/orders?status=PENDING'],
    ['/products/1', '/products/1'],
    ['https://evil.com', '/dashboard'],
    ['//evil.com', '/dashboard'],
    ['/\\evil.com', '/dashboard'],
    ['/foo\\bar', '/dashboard'],
    ['/foo\nbar', '/dashboard'],
    ['/\t/evil.com', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    ['orders', '/dashboard'],
    [null, '/dashboard'],
    [undefined, '/dashboard'],
    ['', '/dashboard'],
  ])('sanitizeNext(%j) → %s', (raw, expected) => {
    expect(sanitizeNext(raw)).toBe(expected);
  });
});
