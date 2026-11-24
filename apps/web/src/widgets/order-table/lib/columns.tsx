import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import type { OrderListItem, OrderSortField } from '@bo/contracts';
import { OrderStatusBadge, type OrderListParams } from '@/entities/order';
import { kst } from '@/shared/lib/dayjs';
import { formatWon } from '@/shared/lib/format-won';

export type SortValue = OrderListParams['sort'];

export const DEFAULT_SORT: SortValue = 'createdAt:desc';

/** none → asc → desc → 기본값. */
export function nextSort(current: string, field: OrderSortField): SortValue {
  if (current === `${field}:asc`) return `${field}:desc`;
  if (current === `${field}:desc`) return DEFAULT_SORT;
  return `${field}:asc`;
}

export function ariaSortOf(
  current: string,
  field: OrderSortField,
): 'ascending' | 'descending' | 'none' {
  if (current === `${field}:asc`) return 'ascending';
  if (current === `${field}:desc`) return 'descending';
  return 'none';
}

/** 정렬 가능한 컬럼 id → 서버 정렬 필드. */
export const SORT_FIELD_BY_COLUMN: Record<string, OrderSortField | undefined> = {
  totalAmount: 'totalAmount',
  createdAt: 'createdAt',
};

export const RIGHT_ALIGNED_COLUMNS = new Set(['itemCount', 'totalAmount']);

export const orderColumns: ColumnDef<OrderListItem>[] = [
  {
    id: 'orderNo',
    header: '주문번호',
    cell: ({ row }) => (
      <Link
        href={`/orders/${row.original.id}`}
        className="font-medium hover:underline focus-visible:underline"
      >
        {row.original.orderNo}
      </Link>
    ),
  },
  { id: 'customerName', header: '고객', cell: ({ row }) => row.original.customerName },
  {
    id: 'status',
    header: '상태',
    cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
  },
  {
    id: 'itemCount',
    header: '품목 수',
    cell: ({ row }) => row.original.itemCount.toLocaleString('ko-KR'),
  },
  { id: 'totalAmount', header: '금액', cell: ({ row }) => formatWon(row.original.totalAmount) },
  {
    id: 'createdAt',
    header: '주문일시',
    cell: ({ row }) => kst(row.original.createdAt).format('YYYY.MM.DD HH:mm'),
  },
];
