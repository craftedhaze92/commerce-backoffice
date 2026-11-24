import { InventoryChangeReason } from '@bo/contracts';

export const INVENTORY_REASON_LABEL: Record<InventoryChangeReason, string> = {
  [InventoryChangeReason.ORDER_CONFIRM]: '주문 확정',
  [InventoryChangeReason.ORDER_CANCEL]: '주문 취소',
  [InventoryChangeReason.MANUAL_ADJUST]: '수동 조정',
};
