import type { CategorySalesItem } from '@bo/contracts';

export interface CategorySlice {
  key: string;
  label: string;
  revenue: number;
  /** 0–100 */
  ratio: number;
  color: string;
}

/**
 * 카테고리 팔레트. app/globals.css의 --color-sector-1..6 과 같은 값이다
 * (recharts와 인라인 style은 CSS 변수를 그대로 못 받아 여기 미러링한다).
 */
const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
/** --color-sector-7 (보라). "기타" 전용이다. */
const ETC_COLOR = '#4a3aa7';
const ETC_KEY = 'etc';
const ETC_LABEL = '기타';

/**
 * 카테고리 매출을 도넛 조각으로 만든다.
 *
 * 매출이 있는 카테고리가 maxNamed(기본 6 = 팔레트 크기)개를 넘으면 매출 상위 maxNamed개를 남기고
 * 나머지를 "기타"로 합친다. 그래서 조각은 최대 7개이고, 이름 있는 조각의 색은 서로 겹치지 않으며
 * sector-7은 "기타"만 쓴다. 7개를 그대로 두면 7번째가 sector-1을 다시 써서 구분이 안 된다.
 * 색은 "기타"를 뺀 조각의 **이름순**으로 팔레트를 배정한다. 매출 순위로 칠하면 숫자가 바뀔 때마다
 * 카테고리끼리 색을 주고받으므로, 이름이 같으면 색도 같게 둔다. "기타"는 항상 보라다.
 */
export function groupCategorySlices(
  items: CategorySalesItem[],
  maxNamed = PALETTE.length,
): CategorySlice[] {
  const positive = items.filter((item) => item.revenue > 0);
  const total = positive.reduce((sum, item) => sum + item.revenue, 0);
  if (total === 0) return [];

  const named: { key: string; label: string; revenue: number }[] = positive.map((item) => ({
    key: item.categoryId,
    label: item.categoryName,
    revenue: item.revenue,
  }));

  let shown = named;
  let etcRevenue = 0;
  if (named.length > maxNamed) {
    const ranked = [...named].sort((a, b) => b.revenue - a.revenue);
    shown = ranked.slice(0, maxNamed);
    etcRevenue = ranked.slice(maxNamed).reduce((sum, s) => sum + s.revenue, 0);
  }

  const colorByKey = new Map(
    [...shown]
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
      .map((s, i) => [s.key, PALETTE[i]]),
  );

  const slices: CategorySlice[] = shown.map((s) => ({
    ...s,
    ratio: (s.revenue / total) * 100,
    color: colorByKey.get(s.key) as string,
  }));
  if (etcRevenue > 0) {
    slices.push({
      key: ETC_KEY,
      label: ETC_LABEL,
      revenue: etcRevenue,
      ratio: (etcRevenue / total) * 100,
      color: ETC_COLOR,
    });
  }
  return slices;
}
