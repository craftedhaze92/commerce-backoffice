'use client';

import Link from 'next/link';
import { useProducts } from '@/entities/product';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ListSkeleton } from '@/shared/ui/table-skeleton';

const SIZE = 5;

export function LowStockTable() {
  const { data, isPending, isError, refetch } = useProducts({
    page: 1,
    size: SIZE,
    q: '',
    lowStock: true,
    sort: 'stock:asc',
  });

  return (
    <Card className="px-(--card-spacing)">
      <div className="flex items-baseline justify-between">
        <h2 className="text-section">재고 부족</h2>
        <Link
          href="/products?lowStock=true"
          className="text-muted-foreground text-xs hover:underline"
        >
          전체 보기
        </Link>
      </div>

      {isError && !data ? (
        <div role="alert" className="flex items-center justify-center gap-3 py-6">
          <span className="text-destructive text-sm">재고 부족 상품을 불러오지 못했습니다</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            다시 시도
          </Button>
        </div>
      ) : isPending || !data ? (
        <ListSkeleton testId="low-stock-skeleton" />
      ) : data.items.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-[13px]">
          재고 부족 상품이 없습니다
        </p>
      ) : (
        <ul className="divide-hairline divide-y">
          {data.items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/products/${p.id}`}
                  className="truncate font-medium hover:underline focus-visible:underline"
                >
                  {p.name}
                </Link>
                <span className="text-muted-foreground truncate text-xs">{p.sku}</span>
              </div>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold">{p.stock}</span>
                <span className="text-muted-foreground"> / 안전재고 {p.safetyStock}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
