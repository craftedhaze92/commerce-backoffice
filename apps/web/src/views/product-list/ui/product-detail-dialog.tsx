'use client';

import { useState } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/skeleton';

interface ProductDetailDialogProps {
  /** 열 상품 id. 없으면 모달이 닫혀 있다. */
  id: string | undefined;
  onClose: () => void;
}

/**
 * 상품 상세·수정 모달. 목록 위에서 열리고 닫기(X)·Esc로 닫는다.
 * 수정 중인 내용을 실수로 잃지 않도록 바깥 클릭으로는 닫지 않는다.
 */
export function ProductDetailDialog({ id, onClose }: ProductDetailDialogProps) {
  return (
    <Dialog
      open={id !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {id !== undefined && <ProductDetail id={id} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** 상품 폼과 같은 2열 라벨·입력 배치의 로딩 자리. 불러온 뒤 화면이 흔들리지 않게 크기를 맞춘다. */
function FormSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
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

function ProductDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const me = useSessionMe();
  const product = useProduct(id);
  const canWrite = me.data !== undefined && can(me.data.role, 'product:write');
  const canAdjust = me.data !== undefined && can(me.data.role, 'inventory:adjust');
  // 조정에 성공하면 이력을 첫 페이지부터 다시 보여 주려고 위젯을 새로 마운트한다
  const [historyKey, setHistoryKey] = useState(0);

  // 권한을 알기 전에 폼을 그리면 매니저에게도 읽기 전용 화면이 잠깐 보인다
  if (product.isPending || me.isPending) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="sr-only">상품 불러오는 중</DialogTitle>
          <Skeleton className="h-7 w-48" />
        </DialogHeader>
        <FormSkeleton />
      </>
    );
  }

  if (product.isError) {
    const notFound = product.error instanceof ApiError && product.error.status === 404;
    return (
      <>
        <DialogHeader>
          <DialogTitle>상품 상세</DialogTitle>
        </DialogHeader>
        <div role="alert" className="flex flex-col items-start gap-3 py-4">
          <p className="text-[15px]">
            {notFound ? '상품을 찾을 수 없습니다' : '상품을 불러오지 못했습니다'}
          </p>
          {notFound ? (
            <Button variant="secondary" onClick={onClose}>
              닫기
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void product.refetch()}>
              다시 시도
            </Button>
          )}
        </div>
      </>
    );
  }

  const detail = product.data;
  return (
    <>
      <DialogHeader className="flex-row items-center justify-between gap-3 pr-8">
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="truncate">{detail.name}</DialogTitle>
          <DialogDescription>{detail.sku}</DialogDescription>
        </div>
        {canWrite && <DeleteProductButton id={detail.id} name={detail.name} onDeleted={onClose} />}
      </DialogHeader>
      <ProductForm key={detail.id} mode="edit" initial={detail} readOnly={!canWrite} />
      <section
        aria-labelledby="inventory-heading"
        className="border-canvas flex flex-col gap-4 border-t-2 pt-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 id="inventory-heading" className="text-section">
              재고
            </h3>
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
    </>
  );
}
