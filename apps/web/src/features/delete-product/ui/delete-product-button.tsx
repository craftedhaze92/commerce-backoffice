'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { useDeleteProduct } from '../model/use-delete-product';

interface DeleteProductButtonProps {
  id: string;
  name: string;
  onDeleted: () => void;
}

export function DeleteProductButton({ id, name, onDeleted }: DeleteProductButtonProps) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteProduct();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        if (!next) remove.reset();
        setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive">상품 삭제</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>‘{name}’ 상품을 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>삭제한 상품은 목록에서 사라집니다.</AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <p role="alert" className="text-destructive text-sm">
            삭제에 실패했습니다. 잠시 후 다시 시도해주세요
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>취소</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(id, {
                onSuccess: () => {
                  setOpen(false);
                  onDeleted();
                },
              })
            }
          >
            {remove.isPending ? '삭제 중...' : '삭제'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
