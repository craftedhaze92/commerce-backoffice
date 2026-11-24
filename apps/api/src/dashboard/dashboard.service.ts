import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { REVENUE_STATUSES, type DashboardSummary } from '@bo/contracts';
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
}
