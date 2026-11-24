'use client';

import { useState } from 'react';
import Link from 'next/link';
import { InventoryChangeReason, type InventoryHistoryItem } from '@bo/contracts';
import { INVENTORY_REASON_LABEL, useInventoryHistory } from '@/entities/inventory';
import { cn } from '@/shared/lib/utils';
import { kst } from '@/shared/lib/dayjs';
import { Button } from '@/shared/ui/button';
import { DataPagination } from '@/shared/ui/data-pagination';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

const SKELETON_ROWS = [0, 1, 2, 3, 4];
const COLUMNS = ['일시', '사유', '증감', '조정 후 재고', '처리자', '비고'];

function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

function Remark({ item }: { item: InventoryHistoryItem }) {
  if (item.reason === InventoryChangeReason.MANUAL_ADJUST) return <>{item.note ?? '-'}</>;
  if (item.refOrderId && item.refOrderNo) {
    return (
      <Link href={`/orders/${item.refOrderId}`} className="text-brand hover:underline">
        {item.refOrderNo}
      </Link>
    );
  }
  return <>-</>;
}

export function InventoryHistory({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const history = useInventoryHistory(productId, page);
  const items = history.data?.items ?? [];
  const totalPages = history.data?.meta.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c, i) => (
              <TableHead key={c} className={cn(i === 2 || i === 3 ? 'text-right' : undefined)}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.isPending ? (
            SKELETON_ROWS.map((i) => (
              <TableRow key={i} data-testid="inventory-skeleton-row" aria-busy="true">
                <TableCell colSpan={COLUMNS.length}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : history.isError ? (
            <TableRow>
              <TableCell colSpan={COLUMNS.length}>
                <div role="alert" className="flex items-center justify-center gap-3 py-4">
                  <span className="text-destructive text-sm">재고 이력을 불러오지 못했습니다</span>
                  <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
                    다시 시도
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length}
                className="text-muted-foreground py-6 text-center text-sm"
              >
                재고 변동 이력이 없습니다
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{kst(item.createdAt).format('YYYY.MM.DD HH:mm')}</TableCell>
                <TableCell>{INVENTORY_REASON_LABEL[item.reason]}</TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium',
                    item.delta > 0 ? 'text-sector-6' : 'text-destructive',
                  )}
                >
                  {signed(item.delta)}
                </TableCell>
                <TableCell className="text-right">{item.quantityAfter}</TableCell>
                <TableCell>{item.actorName ?? '시스템'}</TableCell>
                <TableCell>
                  <Remark item={item} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <DataPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
