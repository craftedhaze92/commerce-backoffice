'use client';

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ProductListItem } from '@bo/contracts';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { cn } from '@/shared/lib/utils';
import {
  useColumnVisibility,
  useHydrateColumnVisibility,
  type ToggleableColumn,
} from '../model/column-visibility-store';
import {
  ariaSortOf,
  COLUMN_LABEL,
  nextSort,
  productColumns,
  RIGHT_ALIGNED_COLUMNS,
  SORT_FIELD_BY_COLUMN,
  type SortValue,
} from '../lib/columns';

interface ProductTableProps {
  data: ProductListItem[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  sort: string;
  onSortChange: (next: SortValue) => void;
}

const SKELETON_ROWS = [0, 1, 2, 3, 4];
const TOGGLEABLE = Object.keys(COLUMN_LABEL) as ToggleableColumn[];

export function ProductTable({
  data,
  isPending,
  isError,
  onRetry,
  sort,
  onSortChange,
}: ProductTableProps) {
  // TanStack Table의 useReactTable은 메모이즈하면 안 되는 함수를 돌려준다. React Compiler 대상에서 뺀다.
  'use no memo';

  useHydrateColumnVisibility();
  const visible = useColumnVisibility((s) => s.visible);
  const setVisible = useColumnVisibility((s) => s.setVisible);

  const table = useReactTable({
    data: data ?? EMPTY,
    columns: productColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: { columnVisibility: visible },
  });

  const colSpan = table.getVisibleLeafColumns().length;
  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              컬럼
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {TOGGLEABLE.map((id) => (
              <DropdownMenuCheckboxItem
                key={id}
                checked={visible[id]}
                onCheckedChange={(checked) => setVisible(id, checked === true)}
              >
                {COLUMN_LABEL[id]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
                        className={cn('-mx-2', right && 'flex-row-reverse')}
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
            SKELETON_ROWS.map((i) => (
              <TableRow key={i} data-testid="product-skeleton-row">
                <TableCell colSpan={colSpan}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : isError ? (
            <TableRow>
              <TableCell colSpan={colSpan}>
                <div role="alert" className="flex items-center justify-center gap-3 py-4">
                  <span className="text-destructive text-sm">상품 목록을 불러오지 못했습니다</span>
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
                조건에 맞는 상품이 없습니다
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
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

const EMPTY: ProductListItem[] = [];
