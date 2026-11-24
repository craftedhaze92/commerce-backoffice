import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OrderListItem, Paginated } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';
import { orderKeys } from './query-keys';
import { toOrderQueryString, type OrderListParams } from './order-list-params';

export function useOrders(
  params: OrderListParams,
): UseQueryResult<Paginated<OrderListItem>, ApiError> {
  return useQuery<Paginated<OrderListItem>, ApiError>({
    queryKey: orderKeys.list(params),
    queryFn: () => {
      const qs = toOrderQueryString(params);
      return http<Paginated<OrderListItem>>(`/orders${qs ? `?${qs}` : ''}`);
    },
    placeholderData: keepPreviousData,
    retry: false,
  });
}
