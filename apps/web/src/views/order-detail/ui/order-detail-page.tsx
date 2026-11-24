'use client';

import Link from 'next/link';
import { OrderStatusBadge, useOrder } from '@/entities/order';
import { OrderActions } from '@/features/change-order-status';
import { OrderTimeline } from '@/widgets/order-timeline';
import { ApiError } from '@/shared/api';
import { kst } from '@/shared/lib/dayjs';
import { formatWon } from '@/shared/lib/format-won';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

export function OrderDetailPage({ id }: { id: string }) {
  const order = useOrder(id);

  if (order.isPending) {
    return (
      <section className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-40 w-full" />
      </section>
    );
  }

  // 백그라운드 재조회가 실패해도 이미 받은 데이터가 있으면 화면을 유지한다
  if (order.data === undefined) {
    const notFound = order.error instanceof ApiError && order.error.status === 404;
    return (
      <section role="alert" className="flex flex-col items-start gap-3 py-8">
        <p className="text-sm">
          {notFound ? '주문을 찾을 수 없습니다' : '주문을 불러오지 못했습니다'}
        </p>
        {notFound ? (
          <Button asChild variant="outline">
            <Link href="/orders">목록으로</Link>
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void order.refetch()}>
            다시 시도
          </Button>
        )}
      </section>
    );
  }

  const detail = order.data;
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">{detail.orderNo}</h1>
          <OrderStatusBadge status={detail.status} />
        </div>
        <p className="text-muted-foreground text-sm">
          고객 {detail.customerName} · 주문일시 {kst(detail.createdAt).format('YYYY.MM.DD HH:mm')}
        </p>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>상품명</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="text-right">단가</TableHead>
            <TableHead className="text-right">수량</TableHead>
            <TableHead className="text-right">소계</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <Link href={`/products/${item.productId}`} className="hover:underline">
                  {item.productName}
                </Link>
              </TableCell>
              <TableCell>{item.sku}</TableCell>
              <TableCell className="text-right tabular-nums">{formatWon(item.unitPrice)}</TableCell>
              <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">{formatWon(item.subtotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>합계</TableCell>
            <TableCell className="text-right font-bold tabular-nums">
              {formatWon(detail.totalAmount)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <OrderActions order={detail} />

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-bold">상태 이력</h2>
        <OrderTimeline history={detail.history} />
      </div>
    </section>
  );
}
