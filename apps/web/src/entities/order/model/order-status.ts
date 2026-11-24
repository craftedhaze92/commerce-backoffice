import { OrderStatus } from '@bo/contracts';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: '접수',
  [OrderStatus.CONFIRMED]: '확정',
  [OrderStatus.SHIPPED]: '출고',
  [OrderStatus.DELIVERED]: '배송완료',
  [OrderStatus.CANCELLED]: '취소',
};
