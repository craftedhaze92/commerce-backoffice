import { describe, expect, it } from 'vitest';
import type { CategorySalesItem } from '@bo/contracts';
import { groupCategorySlices } from './group-slices';

const item = (categoryName: string, revenue: number): CategorySalesItem => ({
  categoryId: `id-${categoryName}`,
  categoryName,
  revenue,
  quantity: 1,
});

const NAMES = ['가', '나', '다', '라', '마', '바', '사', '아'];
const eight = (): CategorySalesItem[] => NAMES.map((n, i) => item(n, (8 - i) * 100));

describe('groupCategorySlices', () => {
  it('≤7 items: unchanged order, ratios sum to 100', () => {
    const slices = groupCategorySlices(eight().slice(0, 7));
    expect(slices.map((s) => s.label)).toEqual(NAMES.slice(0, 7));
    expect(slices.reduce((sum, s) => sum + s.ratio, 0)).toBeCloseTo(100, 10);
    expect(slices.some((s) => s.key === 'etc')).toBe(false);
  });

  it('8 items: top 6 + 기타 with summed revenue; 기타 last', () => {
    const slices = groupCategorySlices(eight());
    expect(slices).toHaveLength(7);
    expect(slices.slice(0, 6).map((s) => s.label)).toEqual(NAMES.slice(0, 6));
    const etc = slices[6];
    expect(etc).toMatchObject({ key: 'etc', label: '기타', revenue: 200 + 100 });
    expect(slices.reduce((sum, s) => sum + s.ratio, 0)).toBeCloseTo(100, 10);
  });

  it('colors follow label order, 기타 always sector-7; swapping revenue ranks keeps colors', () => {
    const a = groupCategorySlices(eight());
    const swapped = eight().map((it) =>
      it.categoryName === '가'
        ? { ...it, revenue: 450 }
        : it.categoryName === '다'
          ? { ...it, revenue: 800 }
          : it,
    );
    const b = groupCategorySlices(swapped);
    const colorOf = (slices: typeof a, label: string) =>
      slices.find((s) => s.label === label)?.color;
    expect(b.map((s) => s.label)).not.toEqual(a.map((s) => s.label));
    for (const n of ['가', '나', '다', '라', '마', '바']) {
      expect(colorOf(b, n)).toBe(colorOf(a, n));
    }
    expect(colorOf(a, '가')).toBe('#2a78d6');
    expect(colorOf(a, '바')).toBe('#008300');
    expect(colorOf(a, '기타')).toBe('#4a3aa7');
    expect(colorOf(b, '기타')).toBe('#4a3aa7');
  });

  it('empty → []', () => {
    expect(groupCategorySlices([])).toEqual([]);
  });

  it('all-zero revenue → []', () => {
    expect(groupCategorySlices([item('가', 0)])).toEqual([]);
  });
});
