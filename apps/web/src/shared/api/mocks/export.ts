import { http, HttpResponse } from 'msw';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xlsxResponse(asciiName: string, koreanName: string) {
  return new HttpResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
    headers: {
      'Content-Type': XLSX,
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(koreanName)}`,
    },
  });
}

/** 엑셀 내보내기 기본 핸들러. 작은 blob과 한글 `filename*`를 돌려준다. */
export const exportHandlers = [
  http.get('/api/v1/products/export', () =>
    xlsxResponse('products_20261121.xlsx', '상품목록_20261121.xlsx'),
  ),
  http.get('/api/v1/orders/export', () =>
    xlsxResponse('orders_20261121.xlsx', '주문목록_20261121.xlsx'),
  ),
];
