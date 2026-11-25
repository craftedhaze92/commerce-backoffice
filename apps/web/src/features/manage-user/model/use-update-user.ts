import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { UpdateUserInput, UserListItem } from '@bo/contracts';
import { userKeys } from '@/entities/user';
import { errorMessage, http, type ApiError } from '@/shared/api';

export const SELF_CHANGE_TITLE = '본인 계정은 변경할 수 없습니다';

/** 서버는 role·isActive가 있으면 값이 같아도 거절하므로, 호출하는 쪽은 바뀐 필드만 보낸다. */
export function useUpdateUser(id: string) {
  const queryClient = useQueryClient();
  return useMutation<UserListItem, ApiError, UpdateUserInput>({
    mutationFn: (input) => http<UserListItem>(`/users/${id}`, { method: 'PATCH', json: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function updateUserErrorMessage(err: unknown): string {
  return errorMessage(err, {
    LAST_ADMIN: '마지막 관리자는 강등하거나 비활성화할 수 없습니다',
    SELF_CHANGE: SELF_CHANGE_TITLE,
  });
}
