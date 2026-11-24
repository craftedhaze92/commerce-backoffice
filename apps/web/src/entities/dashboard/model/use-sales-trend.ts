import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SalesTrend, SalesTrendDays } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';
import { dashboardKeys } from './query-keys';

export function useSalesTrend(days: SalesTrendDays): UseQueryResult<SalesTrend, ApiError> {
  return useQuery<SalesTrend, ApiError>({
    queryKey: dashboardKeys.salesTrend(days),
    queryFn: () => http<SalesTrend>(`/dashboard/sales-trend?days=${days}`),
    placeholderData: keepPreviousData,
    staleTime: 0,
    retry: false,
  });
}
