import type { OrderListParams } from './order-list-params';

export const orderKeys = {
  all: ['orders'] as const,
  list: (p: OrderListParams) => ['orders', 'list', p] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
};
