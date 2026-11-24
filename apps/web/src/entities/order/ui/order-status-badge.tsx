import { OrderStatus } from '@bo/contracts';
import { Badge } from '@/shared/ui/badge';
import { ORDER_STATUS_LABEL } from '../model/order-status';

type Variant = 'secondary' | 'destructive' | 'outline';

/** 색은 globals.css 토큰만 쓴다. 접수 회색, 확정 파랑, 출고 남색, 배송완료 초록, 취소 빨강. */
const STYLE: Record<OrderStatus, { variant: Variant; className?: string }> = {
  [OrderStatus.PENDING]: { variant: 'secondary' },
  [OrderStatus.CONFIRMED]: {
    variant: 'outline',
    className: 'border-transparent bg-brand/10 text-brand',
  },
  [OrderStatus.SHIPPED]: {
    variant: 'outline',
    className: 'border-transparent bg-ramp-5/10 text-ramp-5',
  },
  [OrderStatus.DELIVERED]: {
    variant: 'outline',
    className: 'border-transparent bg-sector-6/10 text-sector-6',
  },
  [OrderStatus.CANCELLED]: { variant: 'destructive' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { variant, className } = STYLE[status];
  return (
    <Badge variant={variant} className={className}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}
