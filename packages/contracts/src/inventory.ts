export enum InventoryChangeReason {
  ORDER_CONFIRM = 'ORDER_CONFIRM',
  ORDER_CANCEL = 'ORDER_CANCEL',
  MANUAL_ADJUST = 'MANUAL_ADJUST',
}

export interface InventoryHistoryItem {
  id: string;
  delta: number;
  quantityAfter: number;
  reason: InventoryChangeReason;
  note: string | null;
  refOrderId: string | null;
  refOrderNo: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface InventoryAdjustInput {
  delta: number;
  note: string;
}

export const INVENTORY_LIMITS = { deltaMax: 1_000_000, noteMax: 200 } as const;
