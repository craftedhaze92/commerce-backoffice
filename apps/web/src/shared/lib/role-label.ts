import { Role } from '@bo/contracts';

export const ROLE_LABEL: Record<Role, string> = {
  [Role.ADMIN]: '관리자',
  [Role.MANAGER]: '매니저',
  [Role.VIEWER]: '뷰어',
};
