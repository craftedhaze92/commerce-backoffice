'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { z } from 'zod';

export interface UrlStatePatchOptions {
  /** true(기본)면 page를 지워 1페이지로 돌린다. */
  resetPage?: boolean;
}

/**
 * URL 쿼리를 zod 스키마로 읽고 쓴다. 목록 필터·정렬·페이지의 단일 출처다.
 * 스키마 필드는 `.catch(default)`를 쓰므로 잘못된 값은 기본값이 된다.
 * 기본값과 같거나 비어 있는 키는 URL에서 지운다.
 */
export function useUrlState<S extends z.ZodType>(
  schema: S,
): [z.output<S>, (patch: Partial<z.input<S>>, opts?: UrlStatePatchOptions) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const value = useMemo(
    () => schema.parse(Object.fromEntries(new URLSearchParams(search))) as z.output<S>,
    [schema, search],
  );

  const set = useCallback(
    (patch: Partial<z.input<S>>, opts: UrlStatePatchOptions = {}) => {
      const { resetPage = true } = opts;
      const defaults = schema.parse({}) as Record<string, unknown>;
      const merged: Record<string, unknown> = {
        ...Object.fromEntries(new URLSearchParams(search)),
        ...patch,
      };
      if (resetPage && !('page' in patch)) delete merged.page;
      const parsed = schema.parse(merged) as Record<string, unknown>;

      const qs = new URLSearchParams();
      for (const [key, raw] of Object.entries(merged)) {
        if (raw === undefined || raw === null || raw === '') continue;
        if (!(key in defaults) && !(key in parsed)) continue;
        if (parsed[key] === defaults[key]) continue;
        qs.set(key, String(raw));
      }
      const query = qs.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [schema, search, router, pathname],
  );

  return [value, set];
}
