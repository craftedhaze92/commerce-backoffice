import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MeResponse } from '@bo/contracts';
import { http, type ApiError } from '@/shared/api';
import { sessionKeys } from './query-keys';

const FIVE_MINUTES = 5 * 60 * 1000;

/** 현재 로그인 사용자. 401이면 에러 상태로 끝나고(재시도 없음) 경계로 던지지 않는다. */
export function useMe(): UseQueryResult<MeResponse, ApiError> {
  return useQuery<MeResponse, ApiError>({
    queryKey: sessionKeys.me,
    queryFn: () => http<MeResponse>('/auth/me'),
    staleTime: FIVE_MINUTES,
    retry: false,
  });
}
