import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Category } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';

const TEN_MINUTES = 10 * 60 * 1000;

export function useCategories(): UseQueryResult<Category[], ApiError> {
  return useQuery<Category[], ApiError>({
    queryKey: ['categories'],
    queryFn: () => http<Category[]>('/categories'),
    staleTime: TEN_MINUTES,
  });
}
