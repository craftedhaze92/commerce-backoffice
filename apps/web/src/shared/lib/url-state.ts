'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
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
  // router.replace 이후 리렌더 전에 set()이 또 불려도 앞선 변경 위에 쌓이도록 최신 쿼리를 들고 있는다
  const latest = useRef(search);
  useEffect(() => {
    latest.current = search;
  }, [search]);

  const value = useMemo(
    () => schema.parse(Object.fromEntries(new URLSearchParams(search))) as z.output<S>,
    [schema, search],
  );

  const set = useCallback(
    (patch: Partial<z.input<S>>, opts: UrlStatePatchOptions = {}) => {
      const { resetPage = true } = opts;
      const defaults = schema.parse({}) as Record<string, unknown>;
      const merged: Record<string, unknown> = {
        ...Object.fromEntries(new URLSearchParams(latest.current)),
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
      latest.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [schema, router, pathname],
  );

  return [value, set];
}

/**
 * 쿼리 키 하나를 읽고 쓴다. 다른 키(필터·정렬·페이지)는 그대로 둔다.
 * 목록 위에 띄우는 모달(`?detail=<id>`)처럼 목록 상태와 따로 움직이는 값에 쓴다.
 */
export function useQueryParam(
  key: string,
): [string | undefined, (value: string | undefined) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const value = searchParams.get(key) ?? undefined;

  const set = useCallback(
    (next: string | undefined) => {
      const qs = new URLSearchParams(search);
      if (next === undefined || next === '') qs.delete(key);
      else qs.set(key, next);
      const query = qs.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [key, search, router, pathname],
  );

  return [value, set];
}

/** 지금 쿼리에 키 하나를 더하거나 바꾼 `?…` 문자열. 링크 href를 만들 때 쓴다. */
export function withQueryParam(search: string, key: string, value: string): string {
  const qs = new URLSearchParams(search);
  qs.set(key, value);
  return `?${qs.toString()}`;
}
