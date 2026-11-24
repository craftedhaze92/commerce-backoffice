import type { OrderStatusHistoryView } from '@bo/contracts';
import { OrderStatusBadge } from '@/entities/order';
import { kst } from '@/shared/lib/dayjs';

/** 상태 변경 이력을 오래된 것부터 보여 준다. */
export function OrderTimeline({ history }: { history: OrderStatusHistoryView[] }) {
  const sorted = [...history].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return (
    <ol aria-label="상태 이력" className="flex flex-col gap-3">
      {sorted.map((h) => (
        <li key={h.id} className="flex items-center gap-3 text-sm">
          <OrderStatusBadge status={h.toStatus} />
          <time dateTime={h.createdAt} className="text-muted-foreground tabular-nums">
            {kst(h.createdAt).format('YYYY.MM.DD HH:mm')}
          </time>
          <span>{h.actorName ?? '시스템'}</span>
        </li>
      ))}
    </ol>
  );
}
