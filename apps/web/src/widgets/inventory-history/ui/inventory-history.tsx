'use client';

import { useState } from 'react';
import Link from 'next/link';
import { InventoryChangeReason, type InventoryHistoryItem } from '@bo/contracts';
import { INVENTORY_REASON_LABEL, useInventoryHistory } from '@/entities/inventory';
import { cn } from '@/shared/lib/utils';
import { kst } from '@/shared/lib/dayjs';
import { Button } from '@/shared/ui/button';
import { DataPagination } from '@/shared/ui/data-pagination';
import { TableSkeletonRows } from '@/shared/ui/table-skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

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

interface InventoryHistoryProps {
  productId: string;
  /** 한 페이지에 보일 이력 수. 상품 상세 모달은 5개씩 넘겨 본다. */
  pageSize?: number;
  /** true면 행을 낮추고 칸 여백을 줄인다(좁은 모달용). 페이지 크기만큼 높이를 잡아 둬 넘길 때 흔들리지 않는다. */
  compact?: boolean;
}

export function InventoryHistory({ productId, pageSize, compact = false }: InventoryHistoryProps) {
  const [page, setPage] = useState(1);
  const history = useInventoryHistory(productId, page, pageSize);
  const items = history.data?.items ?? [];
  const totalPages = history.data?.meta.totalPages ?? 1;

  return (
    <div className={cn('flex flex-col gap-2', compact && 'min-h-[18.75rem] flex-1')}>
      <Table
        // 좁은 열에서도 가로로 넘치지 않게 칸 여백을 줄이고 줄바꿈을 허용한다(비고의 주문번호 등)
        className={cn(
          compact &&
            '[&_td]:h-11 [&_td]:px-2 [&_td]:py-1 [&_td]:break-all [&_td]:whitespace-normal [&_th]:h-10 [&_th]:px-2',
        )}
      >
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
            <TableSkeletonRows
              rows={Math.min(pageSize ?? 5, 5)}
              testId="inventory-skeleton-row"
              cells={['text', 'badge', 'number', 'number', 'text', 'text']}
            />
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
                <TableCell className={cn(compact && 'break-normal whitespace-nowrap')}>
                  {kst(item.createdAt).format(compact ? 'MM.DD HH:mm' : 'YYYY.MM.DD HH:mm')}
                </TableCell>
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
      <DataPagination
        className={cn(compact && 'mt-auto')}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
