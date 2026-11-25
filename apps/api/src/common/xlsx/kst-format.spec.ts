import { describe, expect, it } from 'vitest';
import { formatKstDateTime } from './kst-format.js';

describe('formatKstDateTime', () => {
  it('2026-11-20T15:30:00Z → 2026-11-21 00:30; null → empty string', () => {
    expect(formatKstDateTime(new Date('2026-11-20T15:30:00Z'))).toBe('2026-11-21 00:30');
    expect(formatKstDateTime(null)).toBe('');
  });
});
