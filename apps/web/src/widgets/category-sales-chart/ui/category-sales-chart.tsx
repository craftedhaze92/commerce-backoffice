'use client';

import { Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from 'recharts';
import type { SalesTrendDays } from '@bo/contracts';
import { useCategorySales } from '@/entities/dashboard';
import { formatPercent, formatWon } from '@/shared/lib/format-won';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ChartTooltip } from '@/shared/ui/chart-tooltip';
import { EMPTY_CARD, EMPTY_MESSAGE } from '@/shared/ui/chart-empty';
import { Skeleton } from '@/shared/ui/skeleton';
import { groupCategorySlices, type CategorySlice } from '../lib/group-slices';

/** 툴팁은 범례에 없는 금액을 주 수치로 둔다. 색은 데이터의 fill로 실려 온다. */
function CategoryTooltip({ active, payload }: TooltipContentProps) {
  if (!active || payload.length === 0) return null;
  const slice = payload[0].payload as CategorySlice & { fill: string };
  return (
    <ChartTooltip
      label={slice.label}
      value={formatWon(slice.revenue)}
      sub={formatPercent(slice.ratio, { digits: 1 })}
      swatch={slice.fill}
    />
  );
}

function BodySkeleton() {
  return (
    <div
      data-testid="category-sales-skeleton"
      aria-busy="true"
      className="flex flex-col items-center gap-4 @min-[300px]:flex-row @min-[300px]:gap-[22px]"
    >
      <div className="relative size-[140px] shrink-0 @min-[300px]:size-[164px]">
        <Skeleton className="size-full rounded-full" />
        <div className="bg-card absolute inset-[27%] rounded-full" />
      </div>
      <ul className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-2 @min-[300px]:flex @min-[300px]:flex-1 @min-[300px]:flex-col">
        {[0, 1, 2].map((k) => (
          <li key={k} className="flex items-center gap-2">
            <Skeleton className="size-2.5 rounded-[3px]" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-10" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategorySalesChart({ days }: { days: SalesTrendDays }) {
  const { data, isPending, isError, refetch } = useCategorySales(days);
  const slices = data ? groupCategorySlices(data.items) : [];
  const empty = !!data && slices.length === 0;
  const chartData = slices.map((s) => ({ ...s, fill: s.color }));

  return (
    <Card className={cn('@container px-(--card-spacing)', empty && EMPTY_CARD)}>
      <h2 className="text-section">카테고리별 매출</h2>

      {isError && !data ? (
        <div role="alert" className="flex items-center justify-center gap-3 py-6">
          <span className="text-destructive text-sm">카테고리별 매출을 불러오지 못했습니다</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </div>
      ) : isPending || !data ? (
        <BodySkeleton />
      ) : empty ? (
        <p className={EMPTY_MESSAGE}>기간 내 매출이 없습니다</p>
      ) : (
        <div className="flex flex-col items-center gap-4 @min-[300px]:flex-row @min-[300px]:gap-[22px]">
          <div className="size-[140px] shrink-0 @min-[300px]:size-[164px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 164, height: 164 }}
            >
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="revenue"
                  nameKey="label"
                  innerRadius="73%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={1.5}
                  stroke="none"
                  isAnimationActive
                  animationDuration={600}
                />
                <Tooltip content={CategoryTooltip} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <ul
            aria-label="카테고리별 매출 비율"
            className="grid w-full min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-[13px] tabular-nums @min-[300px]:flex @min-[300px]:flex-1 @min-[300px]:flex-col @min-[300px]:gap-2.5"
          >
            {slices.map((slice) => (
              <li key={slice.key} className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-[3px]"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden
                />
                <span className="flex-1 whitespace-nowrap">{slice.label}</span>
                <span className="font-bold">{formatPercent(slice.ratio, { digits: 1 })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
