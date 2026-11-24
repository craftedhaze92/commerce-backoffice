import { describe, expect, it } from 'vitest';
import { dashboardSchema } from './dashboard-params';

const parse = (qs: string) => dashboardSchema.parse(Object.fromEntries(new URLSearchParams(qs)));

describe('dashboardSchema', () => {
  it('?days=90 → 90', () => {
    expect(parse('days=90')).toEqual({ days: 90 });
    expect(parse('days=7')).toEqual({ days: 7 });
  });

  it('?days=14 / ?days=abc / none → 30', () => {
    expect(parse('days=14')).toEqual({ days: 30 });
    expect(parse('days=abc')).toEqual({ days: 30 });
    expect(parse('')).toEqual({ days: 30 });
  });
});
