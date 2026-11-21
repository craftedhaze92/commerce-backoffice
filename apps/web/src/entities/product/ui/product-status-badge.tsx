import { ProductStatus } from '@bo/contracts';
import { Badge } from '@/shared/ui/badge';
import { PRODUCT_STATUS_LABEL } from '../model/product-status';

const VARIANT: Record<ProductStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  [ProductStatus.DRAFT]: 'outline',
  [ProductStatus.ON_SALE]: 'default',
  [ProductStatus.SOLD_OUT]: 'destructive',
  [ProductStatus.HIDDEN]: 'secondary',
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant={VARIANT[status]}>{PRODUCT_STATUS_LABEL[status]}</Badge>;
}
