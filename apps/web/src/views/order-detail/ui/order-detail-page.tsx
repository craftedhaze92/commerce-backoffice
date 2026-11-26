'use client';

import Link from 'next/link';
import { OrderStatusBadge, useOrder } from '@/entities/order';
import { OrderActions } from '@/features/change-order-status';
import { OrderTimeline } from '@/widgets/order-timeline';
import { ApiError } from '@/shared/api';
import { kst } from '@/shared/lib/dayjs';
import { formatWon } from '@/shared/lib/format-won';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { TableSkeletonRows } from '@/shared/ui/table-skeleton';
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
      <section className="flex flex-col gap-6" aria-busy="true" aria-label="주문 불러오는 중">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-6 w-12 rounded-md" />
          </div>
          <Skeleton className="h-4 w-56" />
        </header>
        <div className="sheet p-4 md:p-6">
          <Table>
            <TableBody>
              <TableSkeletonRows rows={3} cells={['text', 'text', 'number', 'number', 'number']} />
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        <div className="sheet flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
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
          <h1 className="text-title">{detail.orderNo}</h1>
          <OrderStatusBadge status={detail.status} />
        </div>
        <p className="text-muted-foreground text-[15px] font-medium">
          고객 {detail.customerName} · 주문일시 {kst(detail.createdAt).format('YYYY.MM.DD HH:mm')}
        </p>
      </header>

      <div className="sheet p-4 md:p-6">
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
                  {item.productDeleted ? (
                    <span className="inline-flex items-center gap-2">
                      {item.productName}
                      <Badge variant="secondary" className="text-muted-foreground">
                        삭제된 상품
                      </Badge>
                    </span>
                  ) : (
                    <Link href={`/products?detail=${item.productId}`} className="hover:underline">
                      {item.productName}
                    </Link>
                  )}
                </TableCell>
                <TableCell>{item.sku}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatWon(item.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatWon(item.subtotal)}
                </TableCell>
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
      </div>

      <OrderActions order={detail} />

      <div className="sheet flex flex-col gap-4 p-4 md:p-6">
        <h2 className="text-section">상태 이력</h2>
        <OrderTimeline history={detail.history} />
      </div>
    </section>
  );
}
