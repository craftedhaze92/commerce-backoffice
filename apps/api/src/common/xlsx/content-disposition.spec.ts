import { describe, expect, it } from 'vitest';
import { contentDisposition } from './content-disposition.js';

describe('contentDisposition', () => {
  it('주문목록_20261121.xlsx → ascii fallback + UTF-8 filename*', () => {
    expect(contentDisposition('주문목록_20261121.xlsx', 'orders_20261121.xlsx')).toBe(
      `attachment; filename="orders_20261121.xlsx"; filename*=UTF-8''%EC%A3%BC%EB%AC%B8%EB%AA%A9%EB%A1%9D_20261121.xlsx`,
    );
  });

  it("encodes ' ( ) * per RFC 5987", () => {
    const header = contentDisposition("a'b(c)d*e.xlsx", 'x.xlsx');
    expect(header).toContain(`filename*=UTF-8''a%27b%28c%29d%2Ae.xlsx`);
  });
});
