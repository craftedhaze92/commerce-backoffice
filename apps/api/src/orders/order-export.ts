import { ORDER_STATUS_LABEL, type OrderListItem } from '@bo/contracts';
import type { XlsxColumn } from '../common/xlsx/xlsx-writer.js';
import { formatKstDateTime } from '../common/xlsx/kst-format.js';
import type { OrderRow } from './order-mapper.js';

/** The list row plus the timestamps the file shows; times stay Dates until formatted in KST. */
export interface OrderExportRow extends Omit<OrderListItem, 'id' | 'createdAt'> {
  createdAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

export function toExportRow(r: OrderRow): OrderExportRow {
  return {
    orderNo: r.orderNo,
    customerName: r.customerName,
    status: r.status,
    totalAmount: r.totalAmount,
    itemCount: Number(r.itemCount),
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt ?? null,
    cancelledAt: r.cancelledAt ?? null,
  };
}

export const ORDER_EXPORT_COLUMNS: XlsxColumn<OrderExportRow>[] = [
  { header: '주문번호', width: 18, value: (r) => r.orderNo },
  { header: '고객명', width: 18, value: (r) => r.customerName },
  { header: '상태', width: 10, value: (r) => ORDER_STATUS_LABEL[r.status] },
  { header: '품목 수', width: 10, value: (r) => r.itemCount },
  { header: '주문금액', width: 14, value: (r) => r.totalAmount, numFmt: '#,##0' },
  { header: '접수일시', width: 18, value: (r) => formatKstDateTime(r.createdAt) },
  { header: '확정일시', width: 18, value: (r) => formatKstDateTime(r.confirmedAt) },
  { header: '취소일시', width: 18, value: (r) => formatKstDateTime(r.cancelledAt) },
];
