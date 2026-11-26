'use client';

import { toOrderQueryString, useOrders } from '@/entities/order';
import { ExportButton } from '@/features/export-excel';
import { GenerateOrdersButton } from '@/features/generate-orders';
import { ORDER_PAGE_SIZES, OrderFilterBar, useOrderListParams } from '@/features/order-filter';
import { OrderTable } from '@/widgets/order-table';
import { Skeleton } from '@/shared/ui/skeleton';
import { DataPagination } from '@/shared/ui/data-pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

export function OrderListPage() {
  const [params, setParams] = useOrderListParams();
  const orders = useOrders(params);
  const meta = orders.data?.meta;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 whitespace-nowrap">
          <h1 className="text-title">주문</h1>
          {meta ? (
            <span className="text-muted-foreground text-[15px] font-medium tabular-nums">
              총 {meta.total.toLocaleString('ko-KR')}건
            </span>
          ) : (
            <Skeleton aria-hidden className="h-4 w-16 self-center" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton resource="orders" query={toOrderQueryString(params)} />
          <GenerateOrdersButton />
        </div>
      </header>
      <div className="sheet flex flex-col gap-5 p-4 md:p-6">
        <OrderFilterBar params={params} onChange={setParams} />
        <OrderTable
          data={orders.data?.items}
          isPending={orders.isPending}
          isError={orders.isError}
          onRetry={() => void orders.refetch()}
          sort={params.sort}
          onSortChange={(sort) => setParams({ sort })}
        />
        <div className="flex items-center justify-between gap-3">
          <Select value={String(params.size)} onValueChange={(v) => setParams({ size: Number(v) })}>
            <SelectTrigger aria-label="페이지 크기" size="sm" className="w-28">
              <SelectValue>{params.size}개씩</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORDER_PAGE_SIZES.map((s) => (
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
