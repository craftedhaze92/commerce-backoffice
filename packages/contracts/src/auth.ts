import type { Role } from './role';

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserListItem extends MeResponse {
  isActive: boolean;
  /** ISO 8601 */
  createdAt: string;
}
