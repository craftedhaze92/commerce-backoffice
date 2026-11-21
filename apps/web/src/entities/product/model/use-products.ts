import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Paginated, ProductListItem } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';
import { productKeys } from './query-keys';
import { toProductQueryString, type ProductListParams } from './product-list-params';

export function useProducts(
  params: ProductListParams,
): UseQueryResult<Paginated<ProductListItem>, ApiError> {
  return useQuery<Paginated<ProductListItem>, ApiError>({
    queryKey: productKeys.list(params),
    queryFn: () => {
      const qs = toProductQueryString(params);
      return http<Paginated<ProductListItem>>(`/products${qs ? `?${qs}` : ''}`);
    },
    placeholderData: keepPreviousData,
    retry: false,
  });
}
