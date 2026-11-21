import type { ProductSortField, ProductStatus, SortDir } from '@bo/contracts';

export interface ProductListParams {
  page: number;
  size: number;
  q: string;
  categoryId?: string;
  status?: ProductStatus;
  minPrice?: number;
  maxPrice?: number;
  lowStock: boolean;
  sort: `${ProductSortField}:${SortDir}`;
}

export const DEFAULT_PRODUCT_SORT = 'createdAt:desc' as const;
export const DEFAULT_PRODUCT_PAGE_SIZE = 20;

/** 기본값과 빈 값은 생략한다. 키 순서는 고정이라 같은 조건이면 같은 문자열이 나온다. */
export function toProductQueryString(p: ProductListParams): string {
  const qs = new URLSearchParams();
  if (p.page !== 1) qs.set('page', String(p.page));
  if (p.size !== DEFAULT_PRODUCT_PAGE_SIZE) qs.set('size', String(p.size));
  if (p.q !== '') qs.set('q', p.q);
  if (p.categoryId) qs.set('categoryId', p.categoryId);
  if (p.status) qs.set('status', p.status);
  if (p.minPrice !== undefined) qs.set('minPrice', String(p.minPrice));
  if (p.maxPrice !== undefined) qs.set('maxPrice', String(p.maxPrice));
  if (p.lowStock) qs.set('lowStock', 'true');
  if (p.sort !== DEFAULT_PRODUCT_SORT) qs.set('sort', p.sort);
  return qs.toString();
}
