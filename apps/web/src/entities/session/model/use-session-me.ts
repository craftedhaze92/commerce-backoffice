import type { UseQueryResult } from '@tanstack/react-query';
import type { MeResponse } from '@bo/contracts';
import type { ApiError } from '@/shared/api';
import { useHydrated } from '@/shared/lib/hooks/use-hydrated';
import { useMe } from './use-me';

/**
 * 렌더 결과가 세션에 따라 갈리는 컴포넌트용 useMe.
 * 서버는 항상 세션이 없는 상태로 그리므로, 하이드레이션이 끝나기 전에는 캐시에 me가 있어도
 * 없는 것처럼 돌려줘서 서버 마크업과 어긋나지 않게 한다.
 */
export function useSessionMe(): UseQueryResult<MeResponse, ApiError> {
  const hydrated = useHydrated();
  const query = useMe();
  if (hydrated) return query;
  return { ...query, data: undefined, isPending: true } as UseQueryResult<MeResponse, ApiError>;
}
