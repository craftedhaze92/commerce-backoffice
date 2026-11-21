import { ProductStatus } from '@bo/contracts';

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  [ProductStatus.DRAFT]: '임시저장',
  [ProductStatus.ON_SALE]: '판매중',
  [ProductStatus.SOLD_OUT]: '품절',
  [ProductStatus.HIDDEN]: '숨김',
};
