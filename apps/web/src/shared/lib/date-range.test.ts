import { describe, expect, it } from 'vitest';
import {
  dateStringToDate,
  dateToDateString,
  isValidDateString,
  kstPreset,
  kstToday,
} from './date-range';

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

describe('kstToday', () => {
  it('uses the KST calendar date, not UTC', () => {
    expect(kstToday(NOW)).toBe('2026-11-21');
  });
});

describe('dateStringToDate / dateToDateString', () => {
  it('maps YYYY-MM-DD to local midnight of that calendar day', () => {
    const d = dateStringToDate('2026-02-03');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 1, 3, 0]);
  });

  it('round-trips and zero-pads', () => {
    for (const s of ['2026-01-01', '2026-11-30', '2024-02-29']) {
      expect(dateToDateString(dateStringToDate(s))).toBe(s);
    }
    expect(dateToDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
