import type { Role } from './role';

/** `details.reason` of a 409 `CONFLICT` from user create/update. */
export type ConflictReason = 'EMAIL_TAKEN' | 'SELF_CHANGE' | 'LAST_ADMIN';

export const USER_LIMITS = { emailMax: 254, nameMax: 50, passwordMin: 8, passwordMax: 72 } as const;

/** Seeded demo accounts; with `DEMO_MODE=true` they cannot be changed at all (403 `DEMO_PROTECTED`). */
export const DEMO_ACCOUNT_EMAILS = [
  'admin@demo.com',
  'manager@demo.com',
  'viewer@demo.com',
] as const;

export interface CreateUserInput {
  email: string;
  name: string;
  role: Role;
  password: string;
}

export interface UpdateUserInput {
  role?: Role;
  isActive?: boolean;
  name?: string;
}
