import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateUserInput, UserListItem } from '@bo/contracts';
import { userKeys } from '@/entities/user';
import { http, type ApiError } from '@/shared/api';

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation<UserListItem, ApiError, CreateUserInput>({
    mutationFn: (input) => http<UserListItem>('/users', { method: 'POST', json: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}
