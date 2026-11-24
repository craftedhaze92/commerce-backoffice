export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export type OrderAction = 'confirm' | 'ship' | 'deliver' | 'cancel';

/** 상태 전이 규칙의 단일 진실 원천. canTransition·nextStatus·availableActions는 여기서 파생한다. */
export const ORDER_TRANSITIONS: Record<
  OrderAction,
  { from: readonly OrderStatus[]; to: OrderStatus }
> = {
  confirm: { from: [OrderStatus.PENDING], to: OrderStatus.CONFIRMED },
  ship: { from: [OrderStatus.CONFIRMED], to: OrderStatus.SHIPPED },
  deliver: { from: [OrderStatus.SHIPPED], to: OrderStatus.DELIVERED },
  cancel: {
    from: [OrderStatus.PENDING, OrderStatus.CONFIRMED],
    to: OrderStatus.CANCELLED,
  },
};

export function nextStatus(from: OrderStatus, action: OrderAction): OrderStatus | null {
  const rule = ORDER_TRANSITIONS[action];
  return rule.from.includes(from) ? rule.to : null;
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (Object.keys(ORDER_TRANSITIONS) as OrderAction[]).some(
    (action) => ORDER_TRANSITIONS[action].to === to && nextStatus(from, action) !== null,
  );
}

export function availableActions(status: OrderStatus): OrderAction[] {
  return (Object.keys(ORDER_TRANSITIONS) as OrderAction[]).filter(
    (action) => nextStatus(status, action) !== null,
  );
}

export const ORDER_SORT_FIELDS = ['createdAt', 'totalAmount'] as const;
export type OrderSortField = (typeof ORDER_SORT_FIELDS)[number];

export const ORDER_LIMITS = { qMax: 50, randomMax: 50 } as const;

export interface OrderListItem {
  id: string;
  orderNo: string;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
}

export interface OrderItemView {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OrderStatusHistoryView {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorName: string | null;
  createdAt: string;
}

/** history는 오래된 순이다. */
export interface OrderDetail extends OrderListItem {
  confirmedAt: string | null;
  cancelledAt: string | null;
  items: OrderItemView[];
  history: OrderStatusHistoryView[];
}

export interface InsufficientStockItem {
  productId: string;
  sku: string;
  name: string;
  requested: number;
  available: number;
}
