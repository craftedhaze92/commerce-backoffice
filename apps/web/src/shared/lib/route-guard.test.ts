import { describe, expect, it } from 'vitest';
import { resolveRouteRedirect } from './route-guard';

describe('resolveRouteRedirect', () => {
  it.each([
    ['/dashboard', '', false, '/login?next=%2Fdashboard'],
    ['/orders', '?status=PENDING', false, '/login?next=%2Forders%3Fstatus%3DPENDING'],
    ['/login', '', true, '/dashboard'],
    ['/login', '?next=%2Fusers', true, '/users'],
    ['/login', '?next=%2Forders%3Fstatus%3DPENDING', true, '/orders?status=PENDING'],
    ['/login', '?next=https%3A%2F%2Fevil.com', true, '/dashboard'],
    ['/login', '?next=%2F%2Fevil.com', true, '/dashboard'],
    ['/login', '?reason=expired', true, null],
    ['/login', '?reason=expired&next=%2Fusers', true, null],
    ['/login', '?next=%2Fusers', false, null],
    ['/dashboard', '', true, null],
    ['/login', '', false, null],
    ['/forbidden', '', false, '/login?next=%2Fforbidden'],
  ])('resolveRouteRedirect(%s%s, cookie=%s) → %s', (pathname, search, hasCookie, expected) => {
    expect(resolveRouteRedirect(pathname, search, hasCookie)).toBe(expected);
  });
});
