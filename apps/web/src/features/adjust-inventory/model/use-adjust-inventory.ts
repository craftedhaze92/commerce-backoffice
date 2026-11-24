import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { InventoryAdjustInput, ProductDetail } from '@bo/contracts';
import { inventoryKeys } from '@/entities/inventory';
import { productKeys } from '@/entities/product';
import { http, type ApiError } from '@/shared/api';

/**
 * 재고를 수동으로 조정한다. 캐시 갱신은 훅의 onSuccess에 둔다. 컴포넌트의 mutate 콜백은
 * 언마운트되면 실행되지 않지만, 여기 있는 것은 항상 실행된다.
 */
export function useAdjustInventory(productId: string) {
  const queryClient = useQueryClient();
  return useMutation<ProductDetail, ApiError, InventoryAdjustInput>({
    mutationFn: (input) =>
      http<ProductDetail>(`/products/${productId}/inventory`, { method: 'PATCH', json: input }),
    onSuccess: async (detail) => {
      queryClient.setQueryData(productKeys.detail(productId), detail);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.byProduct(productId) }),
      ]);
    },
  });
}
