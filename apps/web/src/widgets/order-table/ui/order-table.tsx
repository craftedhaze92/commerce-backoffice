'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { OrderListItem } from '@bo/contracts';
import { Button } from '@/shared/ui/button';
import { TableSkeletonRows, type SkeletonCellKind } from '@/shared/ui/table-skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { cn } from '@/shared/lib/utils';
import {
  ariaSortOf,
  nextSort,
  orderColumns,
  RIGHT_ALIGNED_COLUMNS,
  SORT_FIELD_BY_COLUMN,
  type SortValue,
} from '../lib/columns';

interface OrderTableProps {
  data: OrderListItem[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  sort: string;
  onSortChange: (next: SortValue) => void;
}

/** 로딩 중 각 컬럼 자리에 그릴 모양. 실제 셀과 같은 정렬·크기로 맞춘다. */
const SKELETON_CELL: Record<string, SkeletonCellKind> = {
  status: 'badge',
  itemCount: 'number',
  totalAmount: 'number',
};

export function OrderTable({
  data,
  isPending,
  isError,
  onRetry,
  sort,
  onSortChange,
}: OrderTableProps) {
  // TanStack Table의 useReactTable은 메모이즈하면 안 되는 함수를 돌려준다. React Compiler 대상에서 뺀다.
  'use no memo';

  const table = useReactTable({
    data: data ?? EMPTY,
    columns: orderColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const colSpan = table.getAllLeafColumns().length;
  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const field = SORT_FIELD_BY_COLUMN[header.column.id];
                const label = flexRender(header.column.columnDef.header, header.getContext());
                const right = RIGHT_ALIGNED_COLUMNS.has(header.column.id);
                const state = field ? ariaSortOf(sort, field) : undefined;
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={state}
                    className={cn(right && 'text-right')}
                  >
                    {field ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          'text-muted-foreground -mx-2 h-7 px-2 text-[13px] font-medium',
                          state !== 'none' && 'text-foreground font-semibold',
                          right && 'flex-row-reverse',
                        )}
                        onClick={() => onSortChange(nextSort(sort, field))}
                      >
                        {label}
                        {state === 'ascending' ? (
                          <ArrowUp aria-hidden />
                        ) : state === 'descending' ? (
                          <ArrowDown aria-hidden />
                        ) : (
                          <ChevronsUpDown aria-hidden className="opacity-50" />
                        )}
                      </Button>
                    ) : (
                      label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableSkeletonRows
              testId="order-skeleton-row"
              cells={table.getVisibleLeafColumns().map((c) => SKELETON_CELL[c.id] ?? 'text')}
            />
          ) : isError ? (
            <TableRow>
              <TableCell colSpan={colSpan}>
                <div role="alert" className="flex items-center justify-center gap-3 py-4">
                  <span className="text-destructive text-sm">주문 목록을 불러오지 못했습니다</span>
                  <Button variant="outline" size="sm" onClick={onRetry}>
                    다시 시도
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colSpan}
                className="text-muted-foreground py-6 text-center text-sm"
              >
                조건에 맞는 주문이 없습니다
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(RIGHT_ALIGNED_COLUMNS.has(cell.column.id) && 'text-right')}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

const EMPTY: OrderListItem[] = [];
