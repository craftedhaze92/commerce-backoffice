import {
  SALES_TREND_DAYS,
  DEFAULT_SALES_TREND_DAYS,
  type ApiErrorBody,
  type CategorySales,
  type DashboardSummary,
  type SalesTrend,
  type SalesTrendDays,
} from '@bo/contracts';
import { http, HttpResponse } from 'msw';
import { kst } from '@/shared/lib/dayjs';

/** 목의 "오늘"이자 추이의 마지막 날. */
const TREND_TO = '2026-11-21';

export const dashboardSummaryFixture: DashboardSummary = {
  today: TREND_TO,
  todayRevenue: 1_500_000,
  yesterdayRevenue: 1_000_000,
  todayOrders: 12,
  yesterdayOrders: 16,
  pendingCount: 5,
  toShipCount: 3,
  lowStockCount: 4,
};

/** days개, 날짜 오름차순, 마지막 날이 2026-11-21. 7번째마다 매출 없는 날을 둔다. */
export function salesTrendFixture(days: SalesTrendDays): SalesTrend {
  const end = kst(`${TREND_TO}T00:00:00+09:00`);
  const points = Array.from({ length: days }, (_, i) => {
    const offset = days - 1 - i;
    const date = end.subtract(offset, 'day').format('YYYY-MM-DD');
    const empty = i % 7 === 3;
    return {
      date,
      revenue: empty ? 0 : 400_000 + ((i * 37) % 11) * 100_000,
      orders: empty ? 0 : 3 + ((i * 5) % 9),
    };
  });
  return {
    days,
    from: points[0].date,
    to: TREND_TO,
    total: points.reduce((sum, p) => sum + p.revenue, 0),
    points,
  };
}

const CATEGORY_NAMES = ['가전', '도서', '뷰티', '스포츠', '식품', '의류', '잡화', '주방'];

const categoryItems = CATEGORY_NAMES.map((categoryName, i) => ({
  categoryId: `00000000-0000-4000-8000-c000${String(i + 1).padStart(8, '0')}`,
  categoryName,
  revenue: (CATEGORY_NAMES.length - i) * 300_000,
  quantity: (CATEGORY_NAMES.length - i) * 7,
}));

export const categorySalesFixture: CategorySales = {
  days: DEFAULT_SALES_TREND_DAYS,
  from: '2026-10-23',
  to: TREND_TO,
  total: categoryItems.reduce((sum, c) => sum + c.revenue, 0),
  items: categoryItems,
};

function parseDays(url: string): SalesTrendDays | null {
  const raw = new URL(url).searchParams.get('days');
  if (raw === null) return DEFAULT_SALES_TREND_DAYS;
  const n = Number(raw);
  return (SALES_TREND_DAYS as readonly number[]).includes(n) ? (n as SalesTrendDays) : null;
}

const badDays = () => {
  const body: ApiErrorBody = {
    statusCode: 400,
    code: 'VALIDATION_FAILED',
    message: '요청 값이 올바르지 않습니다',
    details: [{ field: 'days', message: 'days는 7, 30, 90 중 하나여야 합니다' }],
  };
  return HttpResponse.json(body, { status: 400 });
};

export const dashboardHandlers = [
  http.get('/api/v1/dashboard/summary', () => HttpResponse.json(dashboardSummaryFixture)),
  http.get('/api/v1/dashboard/sales-trend', ({ request }) => {
    const days = parseDays(request.url);
    return days === null ? badDays() : HttpResponse.json(salesTrendFixture(days));
  }),
  http.get('/api/v1/dashboard/category-sales', ({ request }) => {
    const days = parseDays(request.url);
    if (days === null) return badDays();
    const from = kst(`${TREND_TO}T00:00:00+09:00`)
      .subtract(days - 1, 'day')
      .format('YYYY-MM-DD');
    return HttpResponse.json({ ...categorySalesFixture, days, from });
  }),
];
