'use client';

import { Can } from '@/entities/session';
import { toProductQueryString, useProducts } from '@/entities/product';
import { CreateProductDialog } from '@/features/edit-product';
import { ExportButton } from '@/features/export-excel';
import {
  PRODUCT_PAGE_SIZES,
  ProductFilterBar,
  useProductListParams,
} from '@/features/product-filter';
import { ProductColumnMenu, ProductTable } from '@/widgets/product-table';
import { Skeleton } from '@/shared/ui/skeleton';
import { DataPagination } from '@/shared/ui/data-pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export function ProductListPage() {
  const [params, setParams] = useProductListParams();
  const products = useProducts(params);
  const meta = products.data?.meta;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 whitespace-nowrap">
          <h1 className="text-title">상품</h1>
          {meta ? (
            <span className="text-muted-foreground text-[15px] font-medium tabular-nums">
              총 {meta.total.toLocaleString('ko-KR')}개
            </span>
          ) : (
            <Skeleton aria-hidden className="h-4 w-16 self-center" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton resource="products" query={toProductQueryString(params)} />
          <Can permission="product:write">
            <CreateProductDialog />
          </Can>
        </div>
      </header>
      <div className="sheet flex flex-col gap-5 p-4 md:p-6">
        <ProductFilterBar params={params} onChange={setParams} trailing={<ProductColumnMenu />} />
        <ProductTable
          data={products.data?.items}
          isPending={products.isPending}
          isError={products.isError}
          onRetry={() => void products.refetch()}
          sort={params.sort}
          onSortChange={(sort) => setParams({ sort })}
        />
        <div className="flex items-center justify-between gap-3">
          <Select value={String(params.size)} onValueChange={(v) => setParams({ size: Number(v) })}>
            <SelectTrigger aria-label="페이지 크기" size="sm" className="w-28">
              <SelectValue>{params.size}개씩</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}개씩
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DataPagination
            page={params.page}
            totalPages={meta?.totalPages ?? 1}
            onPageChange={(page) => setParams({ page }, { resetPage: false })}
          />
        </div>
      </div>
    </section>
  );
}
