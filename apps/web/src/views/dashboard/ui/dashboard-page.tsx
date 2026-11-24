'use client';

import { useDashboardSummary } from '@/entities/dashboard';
import { useSessionMe } from '@/entities/session';
import { CategorySalesChart } from '@/widgets/category-sales-chart';
import { KpiCards } from '@/widgets/kpi-cards';
import { LowStockTable } from '@/widgets/low-stock-table';
import { RecentOrders } from '@/widgets/recent-orders';
import { SalesTrendChart } from '@/widgets/sales-trend-chart';
import { useUrlState } from '@/shared/lib/url-state';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { dashboardSchema } from '../model/dashboard-params';

export function DashboardPage() {
  const { data: me } = useSessionMe();
  const { data: summary } = useDashboardSummary();
  const [{ days }, setParams] = useUrlState(dashboardSchema);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-bold">대시보드</h1>
          <p className="text-muted-foreground text-sm">
            {me ? `${me.name}님, 안녕하세요` : '안녕하세요'}
            {summary ? ` · 기준일 ${summary.today}` : ''}
          </p>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="차트 기간"
          value={String(days)}
          onValueChange={(v) => {
            if (v) setParams({ days: Number(v) });
          }}
        >
          <ToggleGroupItem value="7">7일</ToggleGroupItem>
          <ToggleGroupItem value="30">30일</ToggleGroupItem>
          <ToggleGroupItem value="90">90일</ToggleGroupItem>
        </ToggleGroup>
      </header>

      <KpiCards />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SalesTrendChart days={days} />
        </div>
        <CategorySalesChart days={days} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RecentOrders />
        <LowStockTable />
      </div>
    </section>
  );
}
