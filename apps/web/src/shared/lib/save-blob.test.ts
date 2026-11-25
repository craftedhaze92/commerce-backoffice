import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVOKE_DELAY_MS, saveBlob } from './save-blob';

describe('saveBlob', () => {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    vi.restoreAllMocks();
  });

  it('creates object URL, clicks anchor with download name, revokes URL after a delay', () => {
    const clicked: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ download: this.download, href: this.href });
    });
    const blob = new Blob(['x']);

    saveBlob(blob, '주문목록_20261121.xlsx');

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicked).toEqual([{ download: '주문목록_20261121.xlsx', href: 'blob:mock' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    // 클릭과 같은 틱에 해제하면 다운로드가 시작되기 전에 URL이 사라질 수 있다.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});
