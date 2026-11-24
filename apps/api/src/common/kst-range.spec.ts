import { AppException } from './app-exception.js';
import { kstDayRange } from './kst-range.js';

describe('kstDayRange', () => {
  it('from=2026-11-20 -> gte 2026-11-19T15:00:00Z; to=2026-11-20 -> lt 2026-11-20T15:00:00Z', () => {
    const r = kstDayRange('2026-11-20', '2026-11-20');
    expect(r.gte?.toISOString()).toBe('2026-11-19T15:00:00.000Z');
    expect(r.lt?.toISOString()).toBe('2026-11-20T15:00:00.000Z');
  });

  it('both absent -> empty; one side only', () => {
    expect(kstDayRange()).toEqual({});
    expect(kstDayRange('2026-11-20').lt).toBeUndefined();
    expect(kstDayRange(undefined, '2026-12-31').lt?.toISOString()).toBe('2026-12-31T15:00:00.000Z');
  });

  it.each(['2026-13-01', '20261120', '2026-11-31', '2026-02-30', '2026-1-5', 'abc'])(
    'invalid %s -> 400',
    (bad) => {
      expect(() => kstDayRange(bad)).toThrow(AppException);
      expect(() => kstDayRange(undefined, bad)).toThrow(AppException);
    },
  );

  it('from > to -> 400', () => {
    expect(() => kstDayRange('2026-11-21', '2026-11-20')).toThrow(AppException);
  });
});
