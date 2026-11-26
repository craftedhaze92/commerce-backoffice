'use client';

import { cn } from '@/shared/lib/utils';
import { Role, type UserListItem } from '@bo/contracts';
import { ROLE_LABEL } from '@/shared/lib/role-label';
import { FORM_FIELD } from '@/shared/ui/form-field';
import { SELF_CHANGE_TITLE, updateUserErrorMessage, useUpdateUser } from '../model/use-update-user';

const ROLES = [Role.ADMIN, Role.MANAGER, Role.VIEWER] as const;

interface UserRoleSelectProps {
  user: UserListItem;
  /** 로그인한 본인 행이면 true. */
  isSelf: boolean;
  /** 실패 문구를 알리고, 성공하면 null로 지운다. */
  onError: (message: string | null) => void;
}

export function UserRoleSelect({ user, isSelf, onError }: UserRoleSelectProps) {
  const update = useUpdateUser(user.id);
  return (
    <select
      aria-label={`${user.name} 역할`}
      className={cn(FORM_FIELD, 'h-8 pr-2 pl-3 text-[13px]')}
      value={user.role}
      disabled={isSelf || update.isPending}
      title={isSelf ? SELF_CHANGE_TITLE : undefined}
      onChange={(e) => {
        const role = e.target.value as Role;
        if (role === user.role) return;
        update.mutate(
          { role },
          {
            onSuccess: () => onError(null),
            onError: (err) => onError(updateUserErrorMessage(err)),
          },
        );
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}
