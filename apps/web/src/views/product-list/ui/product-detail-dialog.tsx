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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
 * 상품 상세·수정 모달. 목록 위에서 열리고 하단의 닫기·Esc로 닫는다. 닫기·저장은 스크롤되지 않는 하단에 둔다.
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
      {/*
        높이를 고정한다. 내용 높이(스켈레톤 → 폼 → 재고 이력)를 따라 모달이 커지면 화면 가운데 정렬 때문에
        위아래로 출렁인다. 넓은 화면에서는 2열(왼쪽 기본 정보·이미지 / 오른쪽 재고)로 펼쳐 스크롤 없이 한 화면에 담고,
        재고 이력은 5개씩 넘겨 본다. 좁은 화면에서는 1열로 쌓이므로 본문(DialogBody)만 스크롤한다.
      */}
      <DialogContent
        className="flex h-[min(51rem,calc(100dvh-2rem))] flex-col sm:max-w-6xl"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {id !== undefined && <ProductDetail id={id} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * 상세 본문 그리드. 상품 폼(split)이 내놓는 두 블록과 재고 영역을 자리에 놓는다.
 * 넓은 화면: 왼쪽 위가 기본 정보, 왼쪽 아래가 이미지(+저장), 오른쪽 열 전체가 재고.
 */
const DETAIL_GRID = [
  'grid content-start gap-x-8 gap-y-6',
  "[grid-template-areas:'main'_'images'_'stock']",
  // 왼쪽은 기본 정보(min-content) 아래 이미지·저장이 남은 높이를 채우고, 오른쪽은 재고가 두 행을 모두 쓴다.
  // auto 행으로 두면 두 행에 걸친 블록의 높이가 다른 행으로 나눠 들어가 칸이 벌어지고 본문이 넘친다.
  "lg:h-full lg:grid-cols-2 lg:grid-rows-[min-content_minmax(0,1fr)] lg:[grid-template-areas:'main_stock'_'images_stock']",
  // 폼은 display: contents라 DOM상 손자이므로 직접 자식(>)이 아니라 하위 선택자로 자리를 준다
  '[&_[data-slot=product-form-main]]:[grid-area:main]',
  '[&_[data-slot=product-form-images]]:[grid-area:images]',
  '[&_[data-slot=product-stock]]:[grid-area:stock]',
].join(' ');

/** 상세 본문과 같은 2열(왼쪽 기본 정보·이미지·저장 / 오른쪽 재고) 로딩 자리. 불러온 뒤 배치가 바뀌지 않게 맞춘다. */
function DetailSkeleton() {
  return (
    <div className="grid h-full gap-x-8 gap-y-6 lg:grid-cols-2" aria-busy="true">
      <div className="flex flex-col gap-5">
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
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
        <Skeleton className="mt-auto ml-auto h-12 w-20 rounded-xl" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
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
  // 닫기·저장은 스크롤되지 않는 하단에 둔다. 폼이 이 자리에 버튼을 그린다
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);

  // X가 없으므로 불러오는 중·오류일 때도 하단에 닫기를 둔다
  const closeFooter = (
    <DialogFooter sticky>
      <Button variant="secondary" size="lg" onClick={onClose}>
        닫기
      </Button>
    </DialogFooter>
  );

  // 권한을 알기 전에 폼을 그리면 매니저에게도 읽기 전용 화면이 잠깐 보인다
  if (product.isPending || me.isPending) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="sr-only">상품 불러오는 중</DialogTitle>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-20" />
        </DialogHeader>
        <DialogBody>
          <DetailSkeleton />
        </DialogBody>
        {closeFooter}
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
        <DialogBody role="alert" className="flex flex-col items-start gap-3 py-4">
          <p className="text-[15px]">
            {notFound ? '상품을 찾을 수 없습니다' : '상품을 불러오지 못했습니다'}
          </p>
          {!notFound && (
            <Button variant="secondary" onClick={() => void product.refetch()}>
              다시 시도
            </Button>
          )}
        </DialogBody>
        {closeFooter}
      </>
    );
  }

  const detail = product.data;
  return (
    <>
      <DialogHeader className="flex-row items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="truncate">{detail.name}</DialogTitle>
          <DialogDescription>{detail.sku}</DialogDescription>
        </div>
        {canWrite && <DeleteProductButton id={detail.id} name={detail.name} onDeleted={onClose} />}
      </DialogHeader>
      <DialogBody className={DETAIL_GRID}>
        <ProductForm
          key={detail.id}
          mode="edit"
          layout="split"
          initial={detail}
          readOnly={!canWrite}
          actionsContainer={footer}
          onCancel={onClose}
          cancelLabel="닫기"
        />
        <section
          aria-labelledby="inventory-heading"
          data-slot="product-stock"
          className="flex flex-col gap-3"
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
          <InventoryHistory key={historyKey} productId={detail.id} pageSize={5} compact />
        </section>
      </DialogBody>
      <DialogFooter ref={setFooter} sticky />
    </>
  );
}
