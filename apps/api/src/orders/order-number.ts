import type { EntityManager } from 'typeorm';

const KST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** KST calendar date of an instant as `YYYY-MM-DD`. */
export function kstDay(now: Date): string {
  return KST_DATE.format(now);
}

export function formatOrderNo(day: string, seq: number): string {
  return `ORD-${day.replaceAll('-', '')}-${String(seq).padStart(4, '0')}`;
}

/** Atomically issues the next `ORD-YYYYMMDD-NNNN` (KST date) from order_sequences, inside the caller's transaction. */
export async function nextOrderNo(m: EntityManager, now: Date): Promise<string> {
  const day = kstDay(now);
  const rows = (await m.query(
    `INSERT INTO order_sequences (day, last) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET last = order_sequences.last + 1
     RETURNING last`,
    [day],
  )) as Array<{ last: number }>;
  return formatOrderNo(day, rows[0]!.last);
}
