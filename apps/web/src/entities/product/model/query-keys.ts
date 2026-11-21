import type { ProductListParams } from './product-list-params';

export const productKeys = {
  all: ['products'] as const,
  list: (p: ProductListParams) => ['products', 'list', p] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
};
