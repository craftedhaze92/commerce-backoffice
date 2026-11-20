import { Role } from './role';

export type Permission =
  | 'dashboard:read'
  | 'product:read'
  | 'product:write'
  | 'inventory:adjust'
  | 'order:read'
  | 'order:write'
  | 'export:download'
  | 'user:manage';

const VIEWER_PERMISSIONS = ['dashboard:read', 'product:read', 'order:read'] as const;
const MANAGER_PERMISSIONS = [
  ...VIEWER_PERMISSIONS,
  'product:write',
  'inventory:adjust',
  'order:write',
  'export:download',
] as const;

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.VIEWER]: VIEWER_PERMISSIONS,
  [Role.MANAGER]: MANAGER_PERMISSIONS,
  [Role.ADMIN]: [...MANAGER_PERMISSIONS, 'user:manage'],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
