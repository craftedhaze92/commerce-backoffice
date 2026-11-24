import { z } from 'zod';
import { ORDER_LIMITS, ORDER_SORT_FIELDS, OrderStatus } from '@bo/contracts';
import {
  DEFAULT_ORDER_PAGE_SIZE,
  DEFAULT_ORDER_SORT,
  type OrderListParams,
} from '@/entities/order';
import { isValidDateString } from '@/shared/lib/date-range';
import { useUrlState, type UrlStatePatchOptions } from '@/shared/lib/url-state';

export const ORDER_PAGE_SIZES = [20, 50, 100] as const;

const SORT_VALUES = ORDER_SORT_FIELDS.flatMap((f) => [`${f}:asc`, `${f}:desc`] as const);

const date = z.string().refine(isValidDateString).optional().catch(undefined);

/** 주문 목록 URL 쿼리의 스키마. 모든 필드가 .catch를 가지므로 조작된 값은 기본값이 된다. */
export const orderListSchema = z
  .object({
    page: z.coerce.number().int().min(1).catch(1),
    size: z.coerce
      .number()
      .refine((n) => (ORDER_PAGE_SIZES as readonly number[]).includes(n))
      .catch(DEFAULT_ORDER_PAGE_SIZE),
    q: z.string().max(ORDER_LIMITS.qMax).catch(''),
    status: z.enum(OrderStatus).optional().catch(undefined),
    from: date,
    to: date,
    sort: z.enum(SORT_VALUES).catch(DEFAULT_ORDER_SORT),
  })
  .transform((v) =>
    v.from !== undefined && v.to !== undefined && v.from > v.to
      ? { ...v, from: undefined, to: undefined }
      : v,
  );

export type OrderListPatch = Partial<OrderListParams>;

export function useOrderListParams(): [
  OrderListParams,
  (patch: OrderListPatch, opts?: UrlStatePatchOptions) => void,
] {
  const [params, set] = useUrlState(orderListSchema);
  return [params, set];
}
