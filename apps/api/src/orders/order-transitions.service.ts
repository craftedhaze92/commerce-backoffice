import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  InventoryChangeReason,
  nextStatus,
  ORDER_TRANSITIONS,
  OrderStatus,
  type OrderAction,
  type OrderDetail,
} from '@bo/contracts';
import { DataSource } from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { InventoryLedger } from '../inventory/inventory-ledger.js';
import { OrderItem } from './order-item.entity.js';
import { OrderStatusHistory } from './order-status-history.entity.js';
import { Order } from './order.entity.js';
import { OrdersService } from './orders.service.js';

@Injectable()
export class OrderTransitionsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: InventoryLedger,
    private readonly orders: OrdersService,
  ) {}

  /**
   * Applies one state transition in a single transaction. Lock order (shared by every stock
   * change): the order row first, then inventories in productId order via the ledger.
   * Any thrown error (404/409/422) rolls the whole transaction back.
   */
  async apply(orderId: string, action: OrderAction, actorId: string): Promise<OrderDetail> {
    await this.dataSource.transaction(async (m) => {
      const order = await m.getRepository(Order).findOne({
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new AppException(404, 'NOT_FOUND', 'Order not found');

      const from = order.status;
      const to = nextStatus(from, action);
      if (to === null) {
        throw new AppException(409, 'CONFLICT', 'Invalid status transition', {
          from,
          to: ORDER_TRANSITIONS[action].to,
        });
      }

      const sign =
        action === 'confirm' ? -1 : action === 'cancel' && from === OrderStatus.CONFIRMED ? 1 : 0;
      if (sign !== 0) {
        const items = await m.getRepository(OrderItem).find({ where: { orderId } });
        const res = await this.ledger.apply(
          m,
          items.map((i) => ({ productId: i.productId, delta: sign * i.quantity })),
          {
            reason:
              sign < 0 ? InventoryChangeReason.ORDER_CONFIRM : InventoryChangeReason.ORDER_CANCEL,
            actorId,
            refOrderId: orderId,
          },
        );
        if (!res.ok) {
          throw new AppException(422, 'INSUFFICIENT_STOCK', '재고가 부족합니다', res.shortages);
        }
      }

      const now = new Date();
      await m.getRepository(Order).update(orderId, {
        status: to,
        updatedAt: now,
        ...(action === 'confirm' ? { confirmedAt: now } : {}),
        ...(action === 'cancel' ? { cancelledAt: now } : {}),
      });
      await m.getRepository(OrderStatusHistory).insert({
        orderId,
        fromStatus: from,
        toStatus: to,
        actorId,
      });
    });
    return this.orders.get(orderId);
  }
}
