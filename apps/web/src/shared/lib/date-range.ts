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

/** KST 기준 오늘(`YYYY-MM-DD`). 달력의 "미래 날짜 막기" 기준이다. */
export function kstToday(now: Date = new Date()): string {
  return kst(now).format(DATE_FORMAT);
}

/**
 * `YYYY-MM-DD`를 달력이 쓰는 로컬 자정 Date로 바꾼다. 달력은 시간대가 아니라 '날짜'를 다루므로
 * 로컬 연·월·일로 만든다(UTC로 만들면 음수 시간대에서 하루가 밀린다).
 */
export function dateStringToDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 달력에서 고른 Date(로컬 날짜)를 `YYYY-MM-DD`로 바꾼다. */
export function dateToDateString(date: Date): string {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
