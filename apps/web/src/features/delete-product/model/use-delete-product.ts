import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productKeys } from '@/entities/product';
import { http, type ApiError } from '@/shared/api';

/**
 * 상품을 삭제한다. 성공하면 상품 쿼리를 무효화하되, 방금 지운 상세는 다시 불러오지 않는다
 * (화면을 떠나기 전에 404 상태가 잠깐 보이는 것을 막는다).
 */
export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => http<void>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: async (_data, id) => {
      const deleted = productKeys.detail(id);
      await queryClient.invalidateQueries({
        queryKey: productKeys.all,
        predicate: (q) => !deleted.every((part, i) => q.queryKey[i] === part),
      });
    },
  });
}
