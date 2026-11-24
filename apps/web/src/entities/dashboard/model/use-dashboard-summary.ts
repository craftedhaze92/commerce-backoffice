import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { DashboardSummary } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';
import { dashboardKeys } from './query-keys';

/** staleTime 0: 주문 전이·재고 조정 뒤 대시보드로 돌아오면 다시 읽는다. */
export function useDashboardSummary(): UseQueryResult<DashboardSummary, ApiError> {
  return useQuery<DashboardSummary, ApiError>({
    queryKey: dashboardKeys.summary(),
    queryFn: () => http<DashboardSummary>('/dashboard/summary'),
    staleTime: 0,
    retry: false,
  });
}
