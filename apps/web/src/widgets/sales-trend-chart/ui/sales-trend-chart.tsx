'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { SalesTrendDays, SalesTrendPoint } from '@bo/contracts';
import { useSalesTrend } from '@/entities/dashboard';
import { kst } from '@/shared/lib/dayjs';
import { formatWon, formatWonCompact } from '@/shared/lib/format-won';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ChartTooltip } from '@/shared/ui/chart-tooltip';
import { EMPTY_CARD, EMPTY_MESSAGE } from '@/shared/ui/chart-empty';
import { Skeleton } from '@/shared/ui/skeleton';

/*
 * recharts props는 CSS 변수를 그대로 못 받아 토큰 값을 미러링한다.
 * LINE_COLOR = --color-sector-1, GRID_COLOR = --color-hairline, TICK_COLOR = --muted-foreground (app/globals.css)
 */
const LINE_COLOR = '#2a78d6';
const GRID_COLOR = '#d8dee6';
const TICK_COLOR = '#8b95a1';

/** 'YYYY-MM-DD' → 'M/D'. 문자열만 다루므로 타임존이 끼어들지 않지만 규칙대로 kst()를 거친다. */
const shortDate = (date: string) => kst(`${date}T00:00:00+09:00`).format('M/D');

function TrendTooltip({ active, payload }: TooltipContentProps) {
  if (!active || payload.length === 0) return null;
  const point = payload[0].payload as SalesTrendPoint;
  return (
    <ChartTooltip
      label={shortDate(point.date)}
      value={formatWon(point.revenue)}
      sub={`${point.orders}건`}
      swatch={LINE_COLOR}
    />
  );
}

function BodySkeleton() {
  return (
    <div data-testid="sales-trend-skeleton" aria-busy="true">
      <Skeleton className="h-[220px] w-full" />
    </div>
  );
}

export function SalesTrendChart({ days }: { days: SalesTrendDays }) {
  const { data, isPending, isError, refetch } = useSalesTrend(days);
  const empty = !!data && data.total === 0;

  return (
    <Card className={cn('px-(--card-spacing)', empty && EMPTY_CARD)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-bold">매출 추이</h2>
        {data ? (
          <div className="flex items-baseline gap-2 tabular-nums">
            <span className="text-base font-semibold">{formatWon(data.total)}</span>
            <span className="text-muted-foreground text-xs">
              {data.from} ~ {data.to}
            </span>
          </div>
        ) : null}
      </div>

      {isError && !data ? (
        <div role="alert" className="flex items-center justify-center gap-3 py-6">
          <span className="text-destructive text-sm">매출 추이를 불러오지 못했습니다</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </div>
      ) : isPending || !data ? (
        <BodySkeleton />
      ) : empty ? (
        <p className={EMPTY_MESSAGE}>기간 내 매출이 없습니다</p>
      ) : (
        <>
          <div className="h-[220px] w-full">
            <ResponsiveContainer
              width="100%"
              height="100%"
              initialDimension={{ width: 640, height: 220 }}
            >
              <LineChart data={data.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 12, fill: TICK_COLOR }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={formatWonCompact}
                  tick={{ fontSize: 12, fill: TICK_COLOR }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                />
                <Tooltip content={TrendTooltip} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke={LINE_COLOR}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive
                  animationDuration={600}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>일별 매출</caption>
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">매출</th>
                <th scope="col">주문</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p) => (
                <tr key={p.date}>
                  <th scope="row">{p.date}</th>
                  <td>{formatWon(p.revenue)}</td>
                  <td>{p.orders}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
