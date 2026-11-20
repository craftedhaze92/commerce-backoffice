import { describe, expect, it } from 'vitest';
import { Role } from './role';
import { can, type Permission } from './permission';

describe('permission', () => {
  it.each([
    [Role.VIEWER, 'product:read', true],
    [Role.VIEWER, 'product:write', false],
    [Role.VIEWER, 'export:download', false],
    [Role.MANAGER, 'order:write', true],
    [Role.MANAGER, 'user:manage', false],
    [Role.ADMIN, 'user:manage', true],
  ])('can(%s, %s) = %s', (role, perm, expected) =>
    expect(can(role, perm as Permission)).toBe(expected),
  );
});
