import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type OrderDetail, type OrderListItem, type Paginated } from '@bo/contracts';
import type { Response } from 'express';
import { DataSource, type ObjectLiteral, Repository, type SelectQueryBuilder } from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { streamExport } from '../common/xlsx/stream-export.js';
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
import { ORDER_EXPORT_COLUMNS, toExportRow } from './order-export.js';
import { applyOrderFilters, buildOrderListQuery } from './order-query.js';
import { OrderStatusHistory } from './order-status-history.entity.js';
import { Order } from './order.entity.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(CLOCK) private readonly clock: Clock,
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

  /**
   * Streams the filtered list (same filters and ordering as list(), page/size ignored) as xlsx.
   * Count and every batch read share one REPEATABLE READ snapshot, via that transaction's manager.
   */
  async export(q: ListOrdersQuery, res: Response): Promise<void> {
    await streamExport({
      dataSource: this.dataSource,
      res,
      logger: this.logger,
      now: this.clock(),
      filename: '주문목록',
      asciiFilename: 'orders',
      sheetName: '주문',
      columns: ORDER_EXPORT_COLUMNS,
      open: async (manager) => {
        const orders = manager.getRepository(Order);
        // Same validation order as list(): a bad sort/from/to is a 400 even when nothing matches.
        const buildBatchQuery = () =>
          buildOrderListQuery(this.selectRow(orders.createQueryBuilder('o')), q);
        buildBatchQuery();
        const total = await applyOrderFilters(orders.createQueryBuilder('o'), q).getCount();
        return {
          total,
          fetchBatch: async (offset, limit) =>
            (await buildBatchQuery().offset(offset).limit(limit).getRawMany<OrderRow>()).map(
              toExportRow,
            ),
        };
      },
    });
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
