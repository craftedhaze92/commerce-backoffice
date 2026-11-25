import type { SalesTrendDays } from '@bo/contracts';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: () => ['dashboard', 'summary'] as const,
  salesTrend: (days: SalesTrendDays) => ['dashboard', 'sales-trend', days] as const,
  categorySales: (days: SalesTrendDays) => ['dashboard', 'category-sales', days] as const,
};
