import type {
  OrderDetail,
  OrderItemView,
  OrderListItem,
  OrderStatus,
  OrderStatusHistoryView,
} from '@bo/contracts';

/** Raw row from the list/detail query (getRawMany); count comes back as a string from pg. */
export interface OrderRow {
  id: string;
  orderNo: string;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
  itemCount: string | number;
  createdAt: Date;
  confirmedAt?: Date | null;
  cancelledAt?: Date | null;
}

export interface OrderItemRow {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderHistoryRow {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorName: string | null;
  createdAt: Date;
}

export function toListItem(r: OrderRow): OrderListItem {
  return {
    id: r.id,
    orderNo: r.orderNo,
    customerName: r.customerName,
    status: r.status,
    totalAmount: r.totalAmount,
    itemCount: Number(r.itemCount),
    createdAt: r.createdAt.toISOString(),
  };
}

export function toItemView(r: OrderItemRow): OrderItemView {
  return {
    id: r.id,
    productId: r.productId,
    sku: r.sku,
    productName: r.productName,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    subtotal: r.unitPrice * r.quantity,
  };
}

export function toHistoryView(r: OrderHistoryRow): OrderStatusHistoryView {
  return {
    id: r.id,
    fromStatus: r.fromStatus,
    toStatus: r.toStatus,
    actorName: r.actorName,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toDetail(
  r: OrderRow,
  items: OrderItemRow[],
  history: OrderHistoryRow[],
): OrderDetail {
  return {
    ...toListItem(r),
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    items: items.map(toItemView),
    history: history.map(toHistoryView),
  };
}
