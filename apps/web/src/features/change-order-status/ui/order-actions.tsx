'use client';

import { useState } from 'react';
import {
  OrderStatus,
  availableActions,
  can,
  type InsufficientStockItem,
  type OrderAction,
  type OrderDetail,
} from '@bo/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { orderKeys } from '@/entities/order';
import { useSessionMe } from '@/entities/session';
import type { ApiError } from '@/shared/api';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { useOrderTransition } from '../model/use-order-transition';

/** 처리에 성공했을 때 토스트 문구. 버튼 이름과 같은 동사를 쓴다. */
const ACTION_DONE: Record<OrderAction, string> = {
  confirm: '주문을 확정했습니다',
  ship: '출고 처리했습니다',
  deliver: '배송 완료로 바꿨습니다',
  cancel: '주문을 취소했습니다',
};

const ACTION_LABEL: Record<OrderAction, string> = {
  confirm: '확정',
  ship: '출고 처리',
  deliver: '배송 완료',
  cancel: '주문 취소',
};

function isStockItem(v: unknown): v is InsufficientStockItem {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Record<string, unknown>;
  return (
    typeof i.productId === 'string' &&
    typeof i.name === 'string' &&
    typeof i.sku === 'string' &&
    typeof i.requested === 'number' &&
    typeof i.available === 'number'
  );
}

function ErrorMessage({ error }: { error: ApiError }) {
  if (error.status === 422 && error.code === 'INSUFFICIENT_STOCK') {
    const items = Array.isArray(error.details) ? error.details.filter(isStockItem) : [];
    return (
      <div role="alert" className="text-destructive text-sm">
        <p>재고가 부족해 확정할 수 없습니다</p>
        <ul className="mt-1 list-disc pl-5">
          {items.map((i) => (
            <li key={i.productId}>
              {i.name}({i.sku}): 필요 {i.requested}개 / 재고 {i.available}개
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <p role="alert" className="text-destructive text-sm">
      {error.status === 409 ? '다른 사용자가 먼저 상태를 바꿨습니다' : '상태를 바꾸지 못했습니다'}
    </p>
  );
}

export function OrderActions({ order }: { order: OrderDetail }) {
  const me = useSessionMe();
  const queryClient = useQueryClient();
  const transition = useOrderTransition(order.id);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (me.data === undefined || !can(me.data.role, 'order:write')) return null;
  const actions = availableActions(order.status);
  // 상태가 바뀐 뒤에도 방금 실패한 전이의 안내(409 등)는 남겨 둔다
  if (actions.length === 0 && !transition.isError) return null;

  const run = (action: OrderAction, onDone?: () => void) => {
    transition.mutate(action, {
      onSuccess: () => toast(ACTION_DONE[action]),
      onError: (error) => {
        // 오래된 화면이다. 최신 상태를 다시 불러온다
        if (error.status === 409) {
          // 상세도 orderKeys.all에 포함되므로 한 번만 무효화한다
          void queryClient.invalidateQueries({ queryKey: orderKeys.all });
        }
      },
      onSettled: onDone,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === 'cancel' ? 'destructive' : 'default'}
            disabled={transition.isPending}
            onClick={() => (action === 'cancel' ? setConfirmingCancel(true) : run(action))}
          >
            {ACTION_LABEL[action]}
          </Button>
        ))}
      </div>
      {transition.isError && <ErrorMessage error={transition.error} />}
      <AlertDialog open={confirmingCancel} onOpenChange={setConfirmingCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>주문을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {order.status === OrderStatus.CONFIRMED
                ? '확정된 주문이라 재고가 되돌아갑니다.'
                : '취소한 주문은 되돌릴 수 없습니다.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>닫기</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={transition.isPending}
              onClick={() => run('cancel', () => setConfirmingCancel(false))}
            >
              주문 취소
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
