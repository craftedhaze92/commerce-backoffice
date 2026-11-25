import { PRODUCT_STATUS_LABEL, type ProductListItem } from '@bo/contracts';
import { formatKstDateTime } from '../common/xlsx/kst-format.js';
import type { XlsxColumn } from '../common/xlsx/xlsx-writer.js';

export const PRODUCT_EXPORT_COLUMNS: XlsxColumn<ProductListItem>[] = [
  { header: 'SKU', width: 16, value: (r) => r.sku },
  { header: '상품명', width: 30, value: (r) => r.name },
  { header: '카테고리', width: 14, value: (r) => r.categoryName },
  { header: '판매가', width: 12, value: (r) => r.price, numFmt: '#,##0' },
  { header: '상태', width: 10, value: (r) => PRODUCT_STATUS_LABEL[r.status] },
  { header: '재고', width: 8, value: (r) => r.stock },
  { header: '안전재고', width: 10, value: (r) => r.safetyStock },
  { header: '재고부족', width: 10, value: (r) => (r.isLowStock ? 'Y' : 'N') },
  { header: '등록일시', width: 18, value: (r) => formatKstDateTime(new Date(r.createdAt)) },
];
