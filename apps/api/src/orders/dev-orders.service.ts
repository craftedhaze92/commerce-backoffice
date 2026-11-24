import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { OrderStatus, type OrderListItem } from '@bo/contracts';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { nextOrderNo } from './order-number.js';

const CUSTOMERS = ['김민준', '이서연', '박지호', '최수아', '정도윤', '강하은', '조현우', '윤지아'];

interface SaleProduct {
  id: string;
  sku: string;
  name: string;
  price: number;
}

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

@Injectable()
export class DevOrdersService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Creates `count` random PENDING orders in one transaction (development aid; no stock is touched). */
  createRandom(count: number, actorId: string): Promise<OrderListItem[]> {
    return this.dataSource.transaction(async (m) => {
      const created: OrderListItem[] = [];
      for (let i = 0; i < count; i++) created.push(await this.createOne(m, actorId));
      return created;
    });
  }

  private async createOne(m: EntityManager, actorId: string): Promise<OrderListItem> {
    const products = (await m.query(
      `SELECT id, sku, name, price FROM products
        WHERE status = 'ON_SALE' AND "deletedAt" IS NULL
        ORDER BY random() LIMIT $1`,
      [randInt(1, 4)],
    )) as SaleProduct[];
    if (products.length === 0) {
      throw new AppException(422, 'VALIDATION_FAILED', '판매 중인 상품이 없습니다');
    }
    const lines = products.map((p) => ({ ...p, quantity: randInt(1, 3) }));
    const totalAmount = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
    const orderNo = await nextOrderNo(m, new Date());
    const customerName = CUSTOMERS[randInt(0, CUSTOMERS.length - 1)]!;

    const [order] = (await m.query(
      `INSERT INTO orders ("orderNo", "customerName", status, "totalAmount")
       VALUES ($1, $2, 'PENDING', $3) RETURNING id, "createdAt"`,
      [orderNo, customerName, totalAmount],
    )) as Array<{ id: string; createdAt: Date }>;
    await m.query(
      `INSERT INTO order_items ("orderId", "productId", sku, "productName", quantity, "unitPrice")
       SELECT $1, * FROM unnest($2::uuid[], $3::text[], $4::text[], $5::int[], $6::int[])`,
      [
        order!.id,
        lines.map((l) => l.id),
        lines.map((l) => l.sku),
        lines.map((l) => l.name),
        lines.map((l) => l.quantity),
        lines.map((l) => l.price),
      ],
    );
    await m.query(
      `INSERT INTO order_status_histories ("orderId", "fromStatus", "toStatus", "actorId")
       VALUES ($1, NULL, 'PENDING', $2)`,
      [order!.id, actorId],
    );
    return {
      id: order!.id,
      orderNo,
      customerName,
      status: OrderStatus.PENDING,
      totalAmount,
      itemCount: lines.length,
      createdAt: order!.createdAt.toISOString(),
    };
  }
}
