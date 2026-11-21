import { describe, expect, it } from 'vitest';
import { Role } from '@bo/contracts';
import { visibleMenu } from './menu';

describe('visibleMenu', () => {
  it('VIEWER sees dashboard·products·orders, not users', () =>
    expect(visibleMenu(Role.VIEWER).map((m) => m.href)).toEqual([
      '/dashboard',
      '/products',
      '/orders',
    ]));
  it('ADMIN sees users', () =>
    expect(visibleMenu(Role.ADMIN).map((m) => m.href)).toContain('/users'));
  it('only orders is coming soon', () =>
    expect(
      visibleMenu(Role.ADMIN)
        .filter((m) => m.comingSoon)
        .map((m) => m.href),
    ).toEqual(['/orders']));
});
