import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ProductCreateInput,
  ProductDetail,
  ProductImage,
  ProductImageRef,
  ProductUpdateInput,
} from '@bo/contracts';
import { productKeys } from '@/entities/product';
import { http, type ApiError } from '@/shared/api';
import type { ProductFormValues } from './product-form-schema';

export type SaveProductVariables =
  | { mode: 'create'; input: ProductCreateInput }
  | { mode: 'edit'; id: string; input: ProductUpdateInput };

const toRefs = (images: readonly ProductImage[]): ProductImageRef[] =>
  images.map(({ id, isPrimary }) => ({ id, isPrimary }));

export function toCreateInput(values: ProductFormValues): ProductCreateInput {
  return {
    sku: values.sku,
    name: values.name,
    categoryId: values.categoryId,
    price: values.price,
    status: values.status,
    description: values.description,
    initialStock: values.initialStock,
    safetyStock: values.safetyStock,
    images: toRefs(values.images),
  };
}

const SCALAR_KEYS = [
  'name',
  'categoryId',
  'price',
  'status',
  'description',
  'safetyStock',
] as const;

/**
 * initial과 비교해 바뀐 필드만 담는다. SKU는 수정할 수 없고 초기 재고는 등록 때만 쓴다.
 * 이미지는 (id, isPrimary)를 순서대로 비교해 다르면 전체 목록을 보낸다.
 */
export function diffUpdateInput(
  initial: ProductDetail,
  values: ProductFormValues,
): ProductUpdateInput {
  const patch: Record<string, unknown> = {};
  for (const key of SCALAR_KEYS) {
    if (values[key] !== initial[key]) patch[key] = values[key];
  }
  const before = toRefs(initial.images);
  const after = toRefs(values.images);
  const imagesChanged =
    before.length !== after.length ||
    before.some((b, i) => b.id !== after[i].id || b.isPrimary !== after[i].isPrimary);
  if (imagesChanged) patch.images = after;
  return patch as ProductUpdateInput;
}

/** 등록은 POST, 수정은 PATCH. 성공하면 상품 쿼리를 모두 무효화한 뒤 끝난다. */
export function useSaveProduct() {
  const queryClient = useQueryClient();
  return useMutation<ProductDetail, ApiError, SaveProductVariables>({
    mutationFn: (v) =>
      v.mode === 'create'
        ? http<ProductDetail>('/products', { method: 'POST', json: v.input })
        : http<ProductDetail>(`/products/${v.id}`, { method: 'PATCH', json: v.input }),
    onSuccess: async (detail) => {
      queryClient.setQueryData(productKeys.detail(detail.id), detail);
      await queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
  });
}
