'use client';

import { useEffect, useState } from 'react';
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
  /** 없으면 등록 화면이다. */
  id?: string;
}

export function ProductEditPage({ id }: ProductEditPageProps) {
  return id === undefined ? <CreateProduct /> : <EditProduct id={id} />;
}

function FormSkeleton() {
  return (
    <div className="flex max-w-3xl flex-col gap-4" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function CreateProduct() {
  const router = useRouter();
  const me = useSessionMe();
  const canWrite = me.data !== undefined && can(me.data.role, 'product:write');
  const forbidden = me.data !== undefined && !canWrite;

  useEffect(() => {
    if (forbidden) router.replace('/forbidden');
  }, [forbidden, router]);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-lg font-bold">상품 등록</h1>
      {canWrite ? (
        <ProductForm
          mode="create"
          onSubmitted={(detail) => router.replace(`/products/${detail.id}`)}
        />
      ) : (
        !forbidden && <FormSkeleton />
      )}
    </section>
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
      <section className="flex flex-col gap-4">
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
    <section className="flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold">{detail.name}</h1>
        {canWrite && (
          <DeleteProductButton
            id={detail.id}
            name={detail.name}
            onDeleted={() => router.replace('/products')}
          />
        )}
      </header>
      <ProductForm key={detail.id} mode="edit" initial={detail} readOnly={!canWrite} />
      <section aria-labelledby="inventory-heading" className="flex max-w-3xl flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 id="inventory-heading" className="text-base font-bold">
              재고
            </h2>
            <span className="text-sm">
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
