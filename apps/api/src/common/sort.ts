import type { SortDir } from '@bo/contracts';
import { AppException } from './app-exception.js';

export function parseSort<F extends string>(
  raw: string | undefined,
  allowed: readonly F[],
  fallback: { field: F; dir: SortDir },
): { field: F; dir: SortDir } {
  if (raw === undefined) return fallback;
  const parts = raw.split(':');
  const [field, dir] = parts;
  if (parts.length !== 2 || !allowed.includes(field as F) || (dir !== 'asc' && dir !== 'desc')) {
    throw new AppException(400, 'VALIDATION_FAILED', 'Invalid sort', [
      {
        field: 'sort',
        messages: [`sort must be <field>:<asc|desc> with field one of ${allowed.join(', ')}`],
      },
    ]);
  }
  return { field: field as F, dir };
}
