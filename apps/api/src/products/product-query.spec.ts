import { describe, expect, it } from 'vitest';
import { escapeLike } from './product-query.js';

describe('escapeLike', () => {
  it('leaves plain text untouched', () => {
    expect(escapeLike('abc 가나')).toBe('abc 가나');
  });

  it.each([
    ['%', '\\%'],
    ['_', '\\_'],
    ['\\', '\\\\'],
    ['50%_a\\b', '50\\%\\_a\\\\b'],
  ])('escapes %s', (raw, expected) => {
    expect(escapeLike(raw)).toBe(expected);
  });
});
