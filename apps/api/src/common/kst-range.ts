import { AppException } from './app-exception.js';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function invalid(field: 'from' | 'to', message: string): AppException {
  return new AppException(400, 'VALIDATION_FAILED', 'Invalid date range', [
    { field, messages: [message] },
  ]);
}

/** 00:00 KST of the given day. KST is a fixed +09:00 offset (no DST). */
function parseKstDay(field: 'from' | 'to', value: string): Date {
  const m = DATE_RE.exec(value);
  if (!m) throw invalid(field, `${field} must be YYYY-MM-DD`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y!, mo! - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo! - 1 || check.getUTCDate() !== d) {
    throw invalid(field, `${field} must be a real calendar date`);
  }
  return new Date(`${value}T00:00:00+09:00`);
}

/** `from` is inclusive at 00:00 KST; `to` is inclusive for the whole day (lt next day 00:00 KST). */
export function kstDayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (from !== undefined) range.gte = parseKstDay('from', from);
  if (to !== undefined) {
    const start = parseKstDay('to', to);
    range.lt = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }
  if (range.gte && range.lt && range.gte.getTime() >= range.lt.getTime()) {
    throw invalid('from', 'from must be ≤ to');
  }
  return range;
}
