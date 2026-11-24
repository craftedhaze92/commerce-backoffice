import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { InventoryHistoryItem, Paginated } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';

export const INVENTORY_HISTORY_PAGE_SIZE = 10;

export const inventoryKeys = {
  /** 한 상품의 모든 페이지. 조정 후 한꺼번에 무효화할 때 쓴다. */
  byProduct: (productId: string) => ['inventory', 'history', productId] as const,
  history: (productId: string, page: number, size: number) =>
    ['inventory', 'history', productId, page, size] as const,
};

export function useInventoryHistory(
  productId: string | undefined,
  page: number,
  size = INVENTORY_HISTORY_PAGE_SIZE,
): UseQueryResult<Paginated<InventoryHistoryItem>, ApiError> {
  return useQuery<Paginated<InventoryHistoryItem>, ApiError>({
    queryKey: inventoryKeys.history(productId ?? '', page, size),
    queryFn: () =>
      http<Paginated<InventoryHistoryItem>>(
        `/products/${productId}/inventory-history?page=${page}&size=${size}`,
      ),
    enabled: productId !== undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
