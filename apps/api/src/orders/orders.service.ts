import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { OrderDetail, OrderListItem, Paginated } from '@bo/contracts';
import { type ObjectLiteral, Repository, type SelectQueryBuilder } from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { toPaginated } from '../common/pagination.js';
import type { ListOrdersQuery } from './dto/list-orders.query.js';
import { OrderItem } from './order-item.entity.js';
import {
  toDetail,
  toListItem,
  type OrderHistoryRow,
  type OrderItemRow,
  type OrderRow,
} from './order-mapper.js';
import { applyOrderFilters, buildOrderListQuery } from './order-query.js';
import { OrderStatusHistory } from './order-status-history.entity.js';
import { Order } from './order.entity.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly items: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory)
    private readonly histories: Repository<OrderStatusHistory>,
  ) {}

  /** itemCount is a correlated COUNT so there is no N+1 and no row multiplication. */
  private selectRow<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
    return qb
      .select('o.id', 'id')
      .addSelect('o.orderNo', 'orderNo')
      .addSelect('o.customerName', 'customerName')
      .addSelect('o.status', 'status')
      .addSelect('o.totalAmount', 'totalAmount')
      .addSelect('o.createdAt', 'createdAt')
      .addSelect('o.confirmedAt', 'confirmedAt')
      .addSelect('o.cancelledAt', 'cancelledAt')
      .addSelect(
        (sub) => sub.select('COUNT(*)').from(OrderItem, 'oi').where('oi.orderId = o.id'),
        'itemCount',
      );
  }

  async list(q: ListOrdersQuery): Promise<Paginated<OrderListItem>> {
    const total = await applyOrderFilters(this.orders.createQueryBuilder('o'), q).getCount();
    const rows = await buildOrderListQuery(this.selectRow(this.orders.createQueryBuilder('o')), q)
      .offset((q.page - 1) * q.size)
      .limit(q.size)
      .getRawMany<OrderRow>();
    return toPaginated(rows.map(toListItem), total, q.page, q.size);
  }

  async get(id: string): Promise<OrderDetail> {
    const row = await this.selectRow(this.orders.createQueryBuilder('o'))
      .where('o.id = :id', { id })
      .getRawOne<OrderRow>();
    if (!row) throw new AppException(404, 'NOT_FOUND', 'Order not found');
    const items = await this.items
      .createQueryBuilder('oi')
      .select('oi.id', 'id')
      .addSelect('oi.productId', 'productId')
      .addSelect('oi.sku', 'sku')
      .addSelect('oi.productName', 'productName')
      .addSelect('oi.quantity', 'quantity')
      .addSelect('oi.unitPrice', 'unitPrice')
      .where('oi.orderId = :id', { id })
      .orderBy('oi.sku', 'ASC')
      .addOrderBy('oi.id', 'ASC')
      .getRawMany<OrderItemRow>();
    // users is joined by table name: orders/ must not import the users module's files.
    const history = await this.histories
      .createQueryBuilder('h')
      .leftJoin('users', 'u', 'u.id = h.actorId')
      .select('h.id', 'id')
      .addSelect('h.fromStatus', 'fromStatus')
      .addSelect('h.toStatus', 'toStatus')
      .addSelect('u.name', 'actorName')
      .addSelect('h.createdAt', 'createdAt')
      .where('h.orderId = :id', { id })
      .orderBy('h.createdAt', 'ASC')
      .addOrderBy('h.id', 'ASC')
      .getRawMany<OrderHistoryRow>();
    return toDetail(row, items, history);
  }
}
