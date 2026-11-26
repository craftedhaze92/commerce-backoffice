import Image from 'next/image';
import Link from 'next/link';
import { ImageIcon } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ProductListItem, ProductSortField } from '@bo/contracts';
import { ProductStatusBadge, type ProductListParams } from '@/entities/product';
import { kst } from '@/shared/lib/dayjs';
import { formatWon } from '@/shared/lib/format-won';
import { Badge } from '@/shared/ui/badge';

export type SortValue = ProductListParams['sort'];

export const DEFAULT_SORT: SortValue = 'createdAt:desc';

/** none → asc → desc → 기본값. */
export function nextSort(current: string, field: ProductSortField): SortValue {
  if (current === `${field}:asc`) return `${field}:desc`;
  if (current === `${field}:desc`) return DEFAULT_SORT;
  return `${field}:asc`;
}

export function ariaSortOf(
  current: string,
  field: ProductSortField,
): 'ascending' | 'descending' | 'none' {
  if (current === `${field}:asc`) return 'ascending';
  if (current === `${field}:desc`) return 'descending';
  return 'none';
}

/** 정렬 가능한 컬럼 id → 서버 정렬 필드. */
export const SORT_FIELD_BY_COLUMN: Record<string, ProductSortField | undefined> = {
  name: 'name',
  price: 'price',
  stock: 'stock',
  updatedAt: 'updatedAt',
};

export const RIGHT_ALIGNED_COLUMNS = new Set(['price', 'stock']);

export const COLUMN_LABEL = {
  thumbnail: '썸네일',
  category: '카테고리',
  updatedAt: '수정일',
} as const;

export const productColumns: ColumnDef<ProductListItem>[] = [
  {
    id: 'thumbnail',
    header: COLUMN_LABEL.thumbnail,
    cell: ({ row }) => {
      const { thumbUrl, name } = row.original;
      return thumbUrl ? (
        <Image
          src={thumbUrl}
          alt={name}
          width={40}
          height={40}
          unoptimized
          className="size-10 rounded-lg object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="bg-canvas text-hairline flex size-10 items-center justify-center rounded-lg"
        >
          <ImageIcon className="size-5" />
        </div>
      );
    },
  },
  {
    id: 'name',
    header: '상품명',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Link
          href={`/products/${row.original.id}`}
          className="font-medium hover:underline focus-visible:underline"
        >
          {row.original.name}
        </Link>
        <span className="text-muted-foreground text-xs">{row.original.sku}</span>
      </div>
    ),
  },
  {
    id: 'category',
    header: COLUMN_LABEL.category,
    cell: ({ row }) => row.original.categoryName,
  },
  {
    id: 'price',
    header: '가격',
    cell: ({ row }) => formatWon(row.original.price),
  },
  {
    id: 'stock',
    header: '재고',
    cell: ({ row }) => (
      <span className="inline-flex items-center justify-end gap-2">
        {row.original.isLowStock && <Badge variant="destructive">부족</Badge>}
        {row.original.stock.toLocaleString('ko-KR')}
      </span>
    ),
  },
  {
    id: 'status',
    header: '상태',
    cell: ({ row }) => <ProductStatusBadge status={row.original.status} />,
  },
  {
    id: 'updatedAt',
    header: COLUMN_LABEL.updatedAt,
    cell: ({ row }) => kst(row.original.updatedAt).format('YYYY.MM.DD'),
  },
];
