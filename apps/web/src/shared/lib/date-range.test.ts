import { describe, expect, it } from 'vitest';
import { isValidDateString, kstPreset } from './date-range';

// UTC 2026-11-20 16:00 = KST 2026-11-21 01:00
const NOW = new Date('2026-11-20T16:00:00Z');

describe('kstPreset', () => {
  it('today is the KST date, not the UTC date', () => {
    expect(kstPreset('today', NOW)).toEqual({ from: '2026-11-21', to: '2026-11-21' });
  });

  it('7d is today-6 … today', () => {
    expect(kstPreset('7d', NOW)).toEqual({ from: '2026-11-15', to: '2026-11-21' });
  });

  it('30d is today-29 … today and crosses month boundaries', () => {
    expect(kstPreset('30d', NOW)).toEqual({ from: '2026-10-23', to: '2026-11-21' });
  });

  it('defaults to the current time', () => {
    expect(kstPreset('today').to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isValidDateString', () => {
  it.each(['2026-11-20', '2024-02-29'])('accepts %s', (s) => {
    expect(isValidDateString(s)).toBe(true);
  });

  it.each(['2026-13-01', '2026-02-30', '2025-02-29', '2026-1-1', 'abc', '', '2026-11-20T00:00'])(
    'rejects %s',
    (s) => {
      expect(isValidDateString(s)).toBe(false);
    },
  );
});
