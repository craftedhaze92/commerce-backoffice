import { OrderStatus } from './order';

/** 매출로 인정하는 주문 상태. SQL은 이 배열을 파라미터로 받는다. */
export const REVENUE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

export const SALES_TREND_DAYS = [7, 30, 90] as const;
export type SalesTrendDays = (typeof SALES_TREND_DAYS)[number];
export const DEFAULT_SALES_TREND_DAYS: SalesTrendDays = 30;

export interface DashboardSummary {
  /** 'YYYY-MM-DD' (KST) */
  today: string;
  todayRevenue: number;
  yesterdayRevenue: number;
  todayOrders: number;
  yesterdayOrders: number;
  /** 확정 대기(PENDING) 주문 수 */
  pendingCount: number;
  /** 출고 대기(CONFIRMED) 주문 수 */
  toShipCount: number;
  lowStockCount: number;
}

export interface SalesTrendPoint {
  /** 'YYYY-MM-DD' (KST) */
  date: string;
  revenue: number;
  orders: number;
}

/** points는 날짜 오름차순이고 빠진 날 없이 days개다. */
export interface SalesTrend {
  days: SalesTrendDays;
  from: string;
  to: string;
  total: number;
  points: SalesTrendPoint[];
}

export interface CategorySalesItem {
  /** "기타"로 합친 항목은 null */
  categoryId: string | null;
  name: string;
  revenue: number;
}

export interface CategorySales {
  days: SalesTrendDays;
  from: string;
  to: string;
  total: number;
  items: CategorySalesItem[];
}

/** (current − previous) / previous × 100. previous가 0이면 비교할 수 없으므로 null. */
export function changeRate(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
