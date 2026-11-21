import { z } from 'zod';
import { PRODUCT_LIMITS, PRODUCT_SORT_FIELDS, ProductStatus } from '@bo/contracts';
import {
  DEFAULT_PRODUCT_PAGE_SIZE,
  DEFAULT_PRODUCT_SORT,
  type ProductListParams,
} from '@/entities/product';
import { useUrlState, type UrlStatePatchOptions } from '@/shared/lib/url-state';

export const PRODUCT_PAGE_SIZES = [20, 50, 100] as const;
export const PRODUCT_Q_MAX = 50;

const SORT_VALUES = PRODUCT_SORT_FIELDS.flatMap((f) => [`${f}:asc`, `${f}:desc`] as const);

/** URL의 문자열("123")만 숫자로 읽는다. 빈 값·음수·소수·공백은 값 없음으로 본다. */
const price = z
  .preprocess((v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
    return undefined;
  }, z.number().int().min(0).max(PRODUCT_LIMITS.maxPrice).optional())
  .catch(undefined);

/**
 * 목록 URL 쿼리의 스키마. 모든 필드가 .catch를 가지므로 조작된 값은 기본값이 된다.
 * 결과는 그대로 API 쿼리가 되므로 화이트리스트 밖의 값은 여기서 걸러진다.
 */
export const productListSchema = z
  .object({
    page: z.coerce.number().int().min(1).catch(1),
    size: z.coerce
      .number()
      .refine((n) => (PRODUCT_PAGE_SIZES as readonly number[]).includes(n))
      .catch(DEFAULT_PRODUCT_PAGE_SIZE),
    q: z.string().max(PRODUCT_Q_MAX).catch(''),
    categoryId: z.uuid().optional().catch(undefined),
    status: z.enum(ProductStatus).optional().catch(undefined),
    minPrice: price,
    maxPrice: price,
    lowStock: z
      .unknown()
      .transform((v) => v === true || v === 'true')
      .catch(false),
    sort: z.enum(SORT_VALUES).catch(DEFAULT_PRODUCT_SORT),
  })
  .transform((v) =>
    v.minPrice !== undefined && v.maxPrice !== undefined && v.minPrice > v.maxPrice
      ? { ...v, minPrice: undefined, maxPrice: undefined }
      : v,
  );

export type ProductListPatch = Partial<ProductListParams>;

export function useProductListParams(): [
  ProductListParams,
  (patch: ProductListPatch, opts?: UrlStatePatchOptions) => void,
] {
  const [params, set] = useUrlState(productListSchema);
  return [params, set];
}
