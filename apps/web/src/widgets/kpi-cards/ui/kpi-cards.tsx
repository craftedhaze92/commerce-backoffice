'use client';

import Link from 'next/link';
import { changeRate, type DashboardSummary } from '@bo/contracts';
import { useDashboardSummary } from '@/entities/dashboard';
import { formatWon } from '@/shared/lib/format-won';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';
const SKELETON_KEYS = [0, 1, 2, 3];

/** 전일 대비. 색만으로 구분하지 않도록 ▲·▼ 기호를 함께 쓴다. */
function Delta({ current, previous }: { current: number; previous: number }) {
  const rate = changeRate(current, previous);
  if (rate === null) return <span className="text-muted-foreground">전일 실적 없음</span>;
  const symbol = rate > 0 ? '▲ ' : rate < 0 ? '▼ ' : '';
  return (
    <span className="text-muted-strong">
      {symbol}
      {Math.abs(rate).toFixed(1)}%<span className="text-muted-foreground"> 전일 대비</span>
    </span>
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  detail?: React.ReactNode;
  href?: string;
}

function KpiCard({ title, value, detail, href }: KpiCardProps) {
  const label = <span className="text-muted-foreground text-[13px]">{title}</span>;
  return (
    <Card role="group" aria-label={title} className="relative gap-2">
      <div className="px-(--card-spacing)">
        {href ? (
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {label}
          </Link>
        ) : (
          label
        )}
      </div>
      <div className="px-(--card-spacing) text-2xl font-semibold tabular-nums">{value}</div>
      {detail ? <div className="px-(--card-spacing) text-xs">{detail}</div> : null}
    </Card>
  );
}

function cardsOf(s: DashboardSummary): KpiCardProps[] {
  return [
    {
      title: '오늘 매출',
      value: formatWon(s.todayRevenue),
      detail: <Delta current={s.todayRevenue} previous={s.yesterdayRevenue} />,
    },
    {
      title: '오늘 주문',
      value: `${s.todayOrders}건`,
      detail: <Delta current={s.todayOrders} previous={s.yesterdayOrders} />,
    },
    {
      title: '처리 대기',
      value: `${s.pendingCount + s.toShipCount}건`,
      detail: (
        <span className="text-muted-foreground">
          <Link href="/orders?status=PENDING" className="hover:underline">
            확정 대기 {s.pendingCount}
          </Link>
          {' · '}
          <Link href="/orders?status=CONFIRMED" className="hover:underline">
            출고 대기 {s.toShipCount}
          </Link>
        </span>
      ),
    },
    {
      title: '재고 부족',
      value: `${s.lowStockCount}개`,
      href: '/products?lowStock=true',
    },
  ];
}

export function KpiCards() {
  const { data, isPending, isError, refetch } = useDashboardSummary();

  if (isError && !data) {
    return (
      <Card>
        <div role="alert" className="flex items-center justify-center gap-3 py-4">
          <span className="text-destructive text-sm">요약 정보를 불러오지 못했습니다</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </div>
      </Card>
    );
  }

  if (isPending || !data) {
    return (
      <div className={GRID} aria-busy="true">
        {SKELETON_KEYS.map((k) => (
          <Card key={k} data-testid="kpi-skeleton" className="gap-3">
            <Skeleton className="mx-(--card-spacing) h-4 w-20" />
            <Skeleton className="mx-(--card-spacing) h-8 w-32" />
            <Skeleton className="mx-(--card-spacing) h-3 w-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={GRID}>
      {cardsOf(data).map((c) => (
        <KpiCard key={c.title} {...c} />
      ))}
    </div>
  );
}
