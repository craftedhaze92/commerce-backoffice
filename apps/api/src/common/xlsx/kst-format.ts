const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `YYYY-MM-DD HH:mm` in KST (fixed +09:00). null → empty string. */
export function formatKstDateTime(d: Date | null): string {
  if (d === null) return '';
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}
