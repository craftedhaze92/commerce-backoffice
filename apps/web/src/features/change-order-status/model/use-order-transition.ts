import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OrderAction, OrderDetail } from '@bo/contracts';
import { inventoryKeys } from '@/entities/inventory';
import { orderKeys } from '@/entities/order';
import { productKeys } from '@/entities/product';
import { http, type ApiError } from '@/shared/api';

/**
 * 주문 상태를 바꾼다. 성공하면 응답으로 상세 캐시를 갱신하고,
 * 재고가 바뀌었으므로 주문·상품·재고 이력 쿼리를 무효화한다.
 */
export function useOrderTransition(id: string) {
  const queryClient = useQueryClient();
  return useMutation<OrderDetail, ApiError, OrderAction>({
    mutationFn: (action) => http<OrderDetail>(`/orders/${id}/${action}`, { method: 'POST' }),
    onSuccess: async (detail) => {
      queryClient.setQueryData(orderKeys.detail(id), detail);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orderKeys.all }),
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      ]);
    },
  });
}
