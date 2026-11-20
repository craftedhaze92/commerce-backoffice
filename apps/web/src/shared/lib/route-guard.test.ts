import { describe, expect, it } from 'vitest';
import { resolveRouteRedirect } from './route-guard';

describe('resolveRouteRedirect', () => {
  it.each([
    ['/dashboard', '', false, '/login?next=%2Fdashboard'],
    ['/orders', '?status=PENDING', false, '/login?next=%2Forders%3Fstatus%3DPENDING'],
    ['/login', '', true, '/dashboard'],
    ['/dashboard', '', true, null],
    ['/login', '', false, null],
    ['/forbidden', '', false, '/login?next=%2Fforbidden'],
  ])('resolveRouteRedirect(%s%s, cookie=%s) → %s', (pathname, search, hasCookie, expected) => {
    expect(resolveRouteRedirect(pathname, search, hasCookie)).toBe(expected);
  });
});
