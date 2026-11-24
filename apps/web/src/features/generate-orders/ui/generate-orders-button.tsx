'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { can } from '@bo/contracts';
import type { OrderListItem } from '@bo/contracts';
import { orderKeys } from '@/entities/order';
import { useSessionMe } from '@/entities/session';
import { http, type ApiError } from '@/shared/api';
import { Button } from '@/shared/ui/button';

const COUNT = 5;

/** 개발 보조 기능. 운영 빌드에서는 렌더하지 않고, MANAGER 이상에게만 보인다. */
export function GenerateOrdersButton() {
  const { data: me } = useSessionMe();
  const queryClient = useQueryClient();
  const generate = useMutation<{ created: OrderListItem[] }, ApiError>({
    mutationFn: () =>
      http<{ created: OrderListItem[] }>('/dev/orders/random', {
        method: 'POST',
        json: { count: COUNT },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orderKeys.all }),
  });

  if (process.env.NODE_ENV === 'production') return null;
  if (!me || !can(me.role, 'order:write')) return null;

  return (
    <div className="flex items-center gap-3">
      {generate.isSuccess && (
        <span role="status" className="text-muted-foreground text-sm">
          주문 {generate.data.created.length}건을 만들었습니다
        </span>
      )}
      {generate.isError && (
        <span role="alert" className="text-destructive text-sm">
          가상 주문을 만들지 못했습니다
        </span>
      )}
      <Button variant="outline" disabled={generate.isPending} onClick={() => generate.mutate()}>
        {generate.isPending ? '생성 중...' : `가상 주문 ${COUNT}건 생성`}
      </Button>
    </div>
  );
}
