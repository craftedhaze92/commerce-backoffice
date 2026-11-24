import type { OrderSortField, OrderStatus, SortDir } from '@bo/contracts';

export interface OrderListParams {
  page: number;
  size: number;
  q: string;
  status?: OrderStatus;
  /** YYYY-MM-DD */
  from?: string;
  /** YYYY-MM-DD */
  to?: string;
  sort: `${OrderSortField}:${SortDir}`;
}

export const DEFAULT_ORDER_SORT = 'createdAt:desc' as const;
export const DEFAULT_ORDER_PAGE_SIZE = 20;

/** 기본값과 빈 값은 생략한다. 키 순서는 고정이라 같은 조건이면 같은 문자열이 나온다. */
export function toOrderQueryString(p: OrderListParams): string {
  const qs = new URLSearchParams();
  if (p.page !== 1) qs.set('page', String(p.page));
  if (p.size !== DEFAULT_ORDER_PAGE_SIZE) qs.set('size', String(p.size));
  if (p.q !== '') qs.set('q', p.q);
  if (p.status) qs.set('status', p.status);
  if (p.from) qs.set('from', p.from);
  if (p.to) qs.set('to', p.to);
  if (p.sort !== DEFAULT_ORDER_SORT) qs.set('sort', p.sort);
  return qs.toString();
}
