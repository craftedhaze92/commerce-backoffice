import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  REVENUE_STATUSES,
  type CategorySales,
  type DashboardSummary,
  type SalesTrend,
  type SalesTrendDays,
} from '@bo/contracts';
import { DataSource } from 'typeorm';
import { CLOCK, type Clock } from '../common/clock.js';
import { addKstDays, kstDateOf, kstDayRange } from '../common/kst-range.js';

interface SummaryRow {
  todayRevenue: string;
  yesterdayRevenue: string;
  todayOrders: number;
  yesterdayOrders: number;
  pendingCount: number;
  toShipCount: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async summary(): Promise<DashboardSummary> {
    const today = kstDateOf(this.clock());
    const yesterday = addKstDays(today, -1);
    const todayStart = kstDayRange(today).gte!;
    const tomorrowStart = kstDayRange(undefined, today).lt!;
    const yesterdayStart = kstDayRange(yesterday).gte!;

    const [row] = (await this.dataSource.query(
      `SELECT
         COALESCE(SUM("totalAmount") FILTER (
           WHERE status = ANY($1::orders_status_enum[]) AND "confirmedAt" >= $2 AND "confirmedAt" < $3
         ), 0)::bigint AS "todayRevenue",
         COALESCE(SUM("totalAmount") FILTER (
           WHERE status = ANY($1::orders_status_enum[]) AND "confirmedAt" >= $4 AND "confirmedAt" < $2
         ), 0)::bigint AS "yesterdayRevenue",
         COUNT(*) FILTER (WHERE "createdAt" >= $2 AND "createdAt" < $3)::int AS "todayOrders",
         COUNT(*) FILTER (WHERE "createdAt" >= $4 AND "createdAt" < $2)::int AS "yesterdayOrders",
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS "pendingCount",
         COUNT(*) FILTER (WHERE status = 'CONFIRMED')::int AS "toShipCount"
       FROM orders`,
      [[...REVENUE_STATUSES], todayStart, tomorrowStart, yesterdayStart],
    )) as SummaryRow[];

    const [low] = (await this.dataSource.query(
      `SELECT COUNT(*)::int AS "count"
       FROM products p
       JOIN inventories i ON i."productId" = p.id
       WHERE p."deletedAt" IS NULL AND i.quantity <= i."safetyStock"`,
    )) as Array<{ count: number }>;

    return {
      today,
      todayRevenue: Number(row!.todayRevenue),
      yesterdayRevenue: Number(row!.yesterdayRevenue),
      todayOrders: Number(row!.todayOrders),
      yesterdayOrders: Number(row!.yesterdayOrders),
      pendingCount: Number(row!.pendingCount),
      toShipCount: Number(row!.toShipCount),
      lowStockCount: Number(low!.count),
    };
  }

  /** 오늘을 포함한 days일의 KST 구간. */
  private period(days: SalesTrendDays) {
    const to = kstDateOf(this.clock());
    const from = addKstDays(to, -(days - 1));
    return {
      from,
      to,
      start: kstDayRange(from).gte!,
      end: kstDayRange(undefined, to).lt!,
    };
  }

  async salesTrend(days: SalesTrendDays): Promise<SalesTrend> {
    const { from, to, start, end } = this.period(days);
    const rows = (await this.dataSource.query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS "date",
              COALESCE(o.revenue, 0)::bigint AS "revenue",
              COALESCE(o.orders, 0)::int AS "orders"
       FROM generate_series($1::date::timestamp, $2::date::timestamp, '1 day') AS d(day)
       LEFT JOIN (
         SELECT ("confirmedAt" AT TIME ZONE 'Asia/Seoul')::date AS day,
                SUM("totalAmount")::bigint AS revenue,
                COUNT(*)::int AS orders
         FROM orders
         WHERE status = ANY($3::orders_status_enum[]) AND "confirmedAt" >= $4 AND "confirmedAt" < $5
         GROUP BY 1
       ) o ON o.day = d.day::date
       ORDER BY d.day`,
      [from, to, [...REVENUE_STATUSES], start, end],
    )) as Array<{ date: string; revenue: string; orders: number }>;

    const points = rows.map((r) => ({
      date: r.date,
      revenue: Number(r.revenue),
      orders: Number(r.orders),
    }));
    return { days, from, to, total: points.reduce((sum, p) => sum + p.revenue, 0), points };
  }

  async categorySales(days: SalesTrendDays): Promise<CategorySales> {
    const { from, to, start, end } = this.period(days);
    const rows = (await this.dataSource.query(
      `SELECT c.id AS "categoryId",
              c.name AS "categoryName",
              SUM(oi.quantity::bigint * oi."unitPrice")::bigint AS "revenue",
              SUM(oi.quantity)::bigint AS "quantity"
       FROM orders o
       JOIN order_items oi ON oi."orderId" = o.id
       JOIN products p ON p.id = oi."productId"
       JOIN categories c ON c.id = p."categoryId"
       WHERE o.status = ANY($1::orders_status_enum[]) AND o."confirmedAt" >= $2 AND o."confirmedAt" < $3
       GROUP BY c.id, c.name
       HAVING SUM(oi.quantity::bigint * oi."unitPrice") > 0
       ORDER BY "revenue" DESC, c.name ASC`,
      [[...REVENUE_STATUSES], start, end],
    )) as Array<{ categoryId: string; categoryName: string; revenue: string; quantity: string }>;

    const items = rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      revenue: Number(r.revenue),
      quantity: Number(r.quantity),
    }));
    return { days, from, to, total: items.reduce((sum, i) => sum + i.revenue, 0), items };
  }
}
