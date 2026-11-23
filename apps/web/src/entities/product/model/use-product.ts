import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { ProductDetail } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';
import { productKeys } from './query-keys';

export function useProduct(id: string | undefined): UseQueryResult<ProductDetail, ApiError> {
  return useQuery<ProductDetail, ApiError>({
    queryKey: productKeys.detail(id ?? ''),
    queryFn: () => http<ProductDetail>(`/products/${id}`),
    enabled: id !== undefined,
    retry: false,
  });
}
