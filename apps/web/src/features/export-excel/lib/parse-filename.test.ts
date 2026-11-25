import { describe, expect, it } from 'vitest';
import { parseContentDispositionFilename } from './parse-filename';

describe('parseContentDispositionFilename', () => {
  it("filename*=UTF-8''... wins over filename", () => {
    const header = `attachment; filename="orders_20261121.xlsx"; filename*=UTF-8''%EC%A3%BC%EB%AC%B8%EB%AA%A9%EB%A1%9D_20261121.xlsx`;
    expect(parseContentDispositionFilename(header)).toBe('주문목록_20261121.xlsx');
  });

  it('accepts quoted and lower/upper-case filename*', () => {
    expect(
      parseContentDispositionFilename(`attachment; FILENAME*="utf-8''%EC%83%81%ED%92%88.xlsx"`),
    ).toBe('상품.xlsx');
  });

  it('falls back to filename="..."', () => {
    expect(parseContentDispositionFilename('attachment; filename="orders_20261121.xlsx"')).toBe(
      'orders_20261121.xlsx',
    );
  });

  it('returns null for a null or filename-less header', () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename('attachment')).toBeNull();
  });

  it('falls back to filename when filename* has a broken percent sequence', () => {
    expect(
      parseContentDispositionFilename(`attachment; filename="a.xlsx"; filename*=UTF-8''%E0%A4%A`),
    ).toBe('a.xlsx');
  });
});
