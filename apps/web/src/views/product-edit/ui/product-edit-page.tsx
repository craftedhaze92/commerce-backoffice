'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { can } from '@bo/contracts';
import { useProduct } from '@/entities/product';
import { useSessionMe } from '@/entities/session';
import { AdjustInventoryDialog } from '@/features/adjust-inventory';
import { DeleteProductButton } from '@/features/delete-product';
import { ProductForm } from '@/features/edit-product';
import { InventoryHistory } from '@/widgets/inventory-history';
import { ApiError } from '@/shared/api';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

interface ProductEditPageProps {
  id: string;
}

/** 상품 상세·수정 화면. 등록은 상품 목록의 모달(`CreateProductDialog`)에서 한다. */
export function ProductEditPage({ id }: ProductEditPageProps) {
  return <EditProduct id={id} />;
}

/** 상품 폼과 같은 2열 라벨·입력 배치의 로딩 자리. 불러온 뒤 화면이 흔들리지 않게 크기를 맞춘다. */
function FormSkeleton() {
  return (
    <div className="sheet flex max-w-3xl flex-col gap-5 p-4 md:p-8" aria-busy="true">
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-14" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
      <Skeleton className="ml-auto h-12 w-20 rounded-xl" />
    </div>
  );
}

function EditProduct({ id }: { id: string }) {
  const router = useRouter();
  const me = useSessionMe();
  const product = useProduct(id);
  const canWrite = me.data !== undefined && can(me.data.role, 'product:write');
  const canAdjust = me.data !== undefined && can(me.data.role, 'inventory:adjust');
  // 조정에 성공하면 이력을 첫 페이지부터 다시 보여 주려고 위젯을 새로 마운트한다
  const [historyKey, setHistoryKey] = useState(0);

  // 권한을 알기 전에 폼을 그리면 매니저에게도 읽기 전용 화면이 잠깐 보인다
  if (product.isPending || me.isPending) {
    return (
      <section className="flex flex-col gap-6">
        <Skeleton className="h-7 w-48" />
        <FormSkeleton />
      </section>
    );
  }

  if (product.isError) {
    const notFound = product.error instanceof ApiError && product.error.status === 404;
    return (
      <section role="alert" className="flex flex-col items-start gap-3 py-8">
        <p className="text-sm">
          {notFound ? '상품을 찾을 수 없습니다' : '상품을 불러오지 못했습니다'}
        </p>
        {notFound ? (
          <Button asChild variant="outline">
            <Link href="/products">목록으로</Link>
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void product.refetch()}>
            다시 시도
          </Button>
        )}
      </section>
    );
  }

  const detail = product.data;
  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-title">{detail.name}</h1>
        {canWrite && (
          <DeleteProductButton
            id={detail.id}
            name={detail.name}
            onDeleted={() => router.replace('/products')}
          />
        )}
      </header>
      <div className="sheet max-w-3xl p-4 md:p-8">
        <ProductForm key={detail.id} mode="edit" initial={detail} readOnly={!canWrite} />
      </div>
      <section
        aria-labelledby="inventory-heading"
        className="sheet flex max-w-3xl flex-col gap-4 p-4 md:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 id="inventory-heading" className="text-section">
              재고
            </h2>
            <span className="text-muted-strong text-[15px] font-medium">
              현재 재고 {detail.stock}개 · 안전 재고 {detail.safetyStock}개
            </span>
            {detail.isLowStock && <Badge variant="destructive">부족</Badge>}
          </div>
          {canAdjust && (
            <AdjustInventoryDialog
              productId={detail.id}
              currentStock={detail.stock}
              onAdjusted={() => setHistoryKey((k) => k + 1)}
            />
          )}
        </div>
        <InventoryHistory key={historyKey} productId={detail.id} />
      </section>
    </section>
  );
}
