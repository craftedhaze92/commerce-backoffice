import { vi } from 'vitest';

/**
 * jsdom은 레이아웃이 없어 모든 요소의 getBoundingClientRect()가 0×0이다.
 * recharts ResponsiveContainer는 마운트 직후 이 값을 읽어 initialDimension을 덮어쓰므로,
 * 그대로 두면 "width(0) and height(0) of chart" 경고가 난다. 차트를 렌더하는 테스트에서 호출한다.
 * 원복은 `vi.restoreAllMocks()`가 한다.
 */
export function stubChartSize(width = 640, height = 220): void {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, width, height),
  );
}
