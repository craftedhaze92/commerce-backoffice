import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { CategorySales, SalesTrendDays } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';
import { dashboardKeys } from './query-keys';

export function useCategorySales(days: SalesTrendDays): UseQueryResult<CategorySales, ApiError> {
  return useQuery<CategorySales, ApiError>({
    queryKey: dashboardKeys.categorySales(days),
    queryFn: () => http<CategorySales>(`/dashboard/category-sales?days=${days}`),
    placeholderData: keepPreviousData,
    staleTime: 0,
    retry: false,
  });
}
