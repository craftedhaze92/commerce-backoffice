'use client';

import Link from 'next/link';
import { DEFAULT_ORDER_SORT, OrderStatusBadge, useOrders } from '@/entities/order';
import { formatKstDateTime } from '@/shared/lib/dayjs';
import { formatWon } from '@/shared/lib/format-won';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';

const SIZE = 5;
const SKELETON_KEYS = [0, 1, 2, 3, 4];

export function RecentOrders() {
  const { data, isPending, isError, refetch } = useOrders({
    page: 1,
    size: SIZE,
    q: '',
    sort: DEFAULT_ORDER_SORT,
  });

  return (
    <Card className="px-(--card-spacing)">
      <div className="flex items-baseline justify-between">
        <h2 className="text-section">최근 주문</h2>
        <Link href="/orders" className="text-muted-foreground text-xs hover:underline">
          전체 보기
        </Link>
      </div>

      {isError && !data ? (
        <div role="alert" className="flex items-center justify-center gap-3 py-6">
          <span className="text-destructive text-sm">최근 주문을 불러오지 못했습니다</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </div>
      ) : isPending || !data ? (
        <div data-testid="recent-orders-skeleton" aria-busy="true" className="flex flex-col gap-3">
          {SKELETON_KEYS.map((k) => (
            <Skeleton key={k} className="h-9 w-full" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-[13px]">주문이 없습니다</p>
      ) : (
        <ul className="divide-hairline divide-y">
          {data.items.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/orders/${o.id}`}
                  className="truncate font-medium hover:underline focus-visible:underline"
                >
                  {o.orderNo}
                </Link>
                <span className="text-muted-foreground truncate text-xs">
                  {o.customerName} · {formatKstDateTime(o.createdAt)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <OrderStatusBadge status={o.status} />
                <span className="w-24 text-right tabular-nums">{formatWon(o.totalAmount)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
