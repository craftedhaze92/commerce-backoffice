import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Paginated, UserListItem } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';

export const USERS_PAGE_SIZE = 20;

export const userKeys = {
  all: ['users'] as const,
  list: (page: number) => ['users', page] as const,
};

/** 사용자 목록(ADMIN 전용). 권한이 없으면 403 ApiError로 끝난다. */
export function useUsers(
  page: number,
  options: { enabled?: boolean } = {},
): UseQueryResult<Paginated<UserListItem>, ApiError> {
  return useQuery<Paginated<UserListItem>, ApiError>({
    queryKey: userKeys.list(page),
    queryFn: () => http<Paginated<UserListItem>>(`/users?page=${page}&size=${USERS_PAGE_SIZE}`),
    placeholderData: keepPreviousData,
    retry: false,
    enabled: options.enabled ?? true,
  });
}
