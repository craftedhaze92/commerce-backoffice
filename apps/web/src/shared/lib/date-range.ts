import { kst } from './dayjs';

const DATE_FORMAT = 'YYYY-MM-DD';
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type KstPresetKind = 'today' | '7d' | '30d';

/**
 * KST 기준 기간 프리셋. `7d`·`30d`는 오늘을 포함하므로 from = 오늘 − 6일·29일이다.
 * UTC로 자르면 KST 새벽 0~9시에 하루가 어긋나므로 반드시 kst()로 계산한다.
 */
export function kstPreset(
  kind: KstPresetKind,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = kst(now);
  const back = kind === 'today' ? 0 : kind === '7d' ? 6 : 29;
  return { from: today.subtract(back, 'day').format(DATE_FORMAT), to: today.format(DATE_FORMAT) };
}

/** 엄격한 `YYYY-MM-DD`이면서 달력에 실제로 있는 날짜인지 본다(2026-02-30은 거부). */
export function isValidDateString(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}
