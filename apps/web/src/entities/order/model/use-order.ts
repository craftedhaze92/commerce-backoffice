import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OrderDetail } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';
import { orderKeys } from './query-keys';

export function useOrder(id: string | undefined): UseQueryResult<OrderDetail, ApiError> {
  return useQuery<OrderDetail, ApiError>({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn: () => http<OrderDetail>(`/orders/${id}`),
    enabled: id !== undefined,
    retry: false,
  });
}
