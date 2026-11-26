'use client';

import { useState } from 'react';
import type { ProductDetail } from '@bo/contracts';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { ProductForm } from './product-form';

interface CreateProductDialogProps {
  /** 등록에 성공해 모달이 닫힌 뒤 부른다. 목록은 저장 훅이 무효화해 새로 불러온다. */
  onCreated?: (detail: ProductDetail) => void;
}

/**
 * 상품 등록 모달. 닫기(X)·Esc·취소로 닫을 수 있고, 닫으면 입력 중인 내용은 버린다.
 * 바깥 클릭으로는 닫지 않는다 — 긴 폼을 실수로 잃지 않게 한다.
 */
export function CreateProductDialog({ onCreated }: CreateProductDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>상품 등록</Button>
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>상품 등록</DialogTitle>
          <DialogDescription>
            새 상품 정보를 입력하세요. 이미지는 나중에 추가해도 됩니다.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ProductForm
            mode="create"
            onCancel={() => setOpen(false)}
            onSubmitted={(detail) => {
              setOpen(false);
              toast('상품을 등록했습니다');
              onCreated?.(detail);
            }}
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
