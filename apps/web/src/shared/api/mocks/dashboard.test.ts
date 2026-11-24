import { describe, expect, it } from 'vitest';
import type { CategorySales, DashboardSummary, SalesTrend } from '@bo/contracts';
import { ApiError, http } from '@/shared/api';
import { categorySalesFixture, dashboardSummaryFixture, salesTrendFixture } from './dashboard';

describe('dashboard mocks', () => {
  it('salesTrendFixture(days) has days points, ascending, ending 2026-11-21', () => {
    for (const days of [7, 30, 90] as const) {
      const t = salesTrendFixture(days);
      expect(t.points).toHaveLength(days);
      expect(t.to).toBe('2026-11-21');
      expect(t.points.at(-1)?.date).toBe('2026-11-21');
      expect(t.points[0].date).toBe(t.from);
      const dates = t.points.map((p) => p.date);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(dates).size).toBe(days);
      expect(t.total).toBe(t.points.reduce((s, p) => s + p.revenue, 0));
    }
    expect(salesTrendFixture(7).from).toBe('2026-11-15');
    expect(salesTrendFixture(30).points.some((p) => p.revenue === 0 && p.orders === 0)).toBe(true);
  });

  it('categorySalesFixture has 8 categories', () => {
    expect(categorySalesFixture.items).toHaveLength(8);
  });

  it('serves summary, trend and category sales', async () => {
    expect(await http<DashboardSummary>('/dashboard/summary')).toEqual(dashboardSummaryFixture);
    const t = await http<SalesTrend>('/dashboard/sales-trend?days=7');
    expect(t.points).toHaveLength(7);
    expect((await http<SalesTrend>('/dashboard/sales-trend')).days).toBe(30);
    const c = await http<CategorySales>('/dashboard/category-sales?days=90');
    expect(c.days).toBe(90);
    expect(c.items).toHaveLength(8);
  });

  it('answers 400 VALIDATION_FAILED for a bad days', async () => {
    for (const path of ['/dashboard/sales-trend?days=14', '/dashboard/category-sales?days=x']) {
      const err = await http(path).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(400);
      expect((err as ApiError).code).toBe('VALIDATION_FAILED');
    }
  });
});
