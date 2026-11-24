import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { InventoryHistoryItem, Paginated } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';

export const inventoryKeys = {
  history: (productId: string, page: number) => ['inventory', 'history', productId, page] as const,
};

export function useInventoryHistory(
  productId: string | undefined,
  page: number,
): UseQueryResult<Paginated<InventoryHistoryItem>, ApiError> {
  return useQuery<Paginated<InventoryHistoryItem>, ApiError>({
    queryKey: inventoryKeys.history(productId ?? '', page),
    queryFn: () =>
      http<Paginated<InventoryHistoryItem>>(
        `/products/${productId}/inventory-history?page=${page}`,
      ),
    enabled: productId !== undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
