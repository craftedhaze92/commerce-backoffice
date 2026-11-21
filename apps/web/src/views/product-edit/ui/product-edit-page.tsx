'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { can } from '@bo/contracts';
import { useProduct } from '@/entities/product';
import { useMe } from '@/entities/session';
import { DeleteProductButton } from '@/features/delete-product';
import { ProductForm } from '@/features/edit-product';
import { ApiError } from '@/shared/api';
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
  const me = useMe();
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
  const me = useMe();
  const product = useProduct(id);
  const canWrite = me.data !== undefined && can(me.data.role, 'product:write');

  if (product.isPending) {
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
    </section>
  );
}
