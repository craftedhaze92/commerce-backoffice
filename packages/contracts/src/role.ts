export enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  VIEWER = 'VIEWER',
}

export const ROLE_RANK: Record<Role, number> = {
  [Role.VIEWER]: 1,
  [Role.MANAGER]: 2,
  [Role.ADMIN]: 3,
};

export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
