import { describe, expect, it } from 'vitest';
import { Role, hasRole } from './role';

describe('role', () => {
  it('hasRole follows hierarchy', () => {
    expect(hasRole(Role.ADMIN, Role.MANAGER)).toBe(true);
    expect(hasRole(Role.MANAGER, Role.MANAGER)).toBe(true);
    expect(hasRole(Role.VIEWER, Role.MANAGER)).toBe(false);
  });
});
