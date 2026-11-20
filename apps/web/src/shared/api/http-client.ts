import type { ApiErrorBody } from '@bo/contracts';
import { ApiError } from './api-error';

const API_PREFIX = '/api/v1';
/** 401이어도 refresh를 시도하지 않는 인증 경로 */
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

export type HttpInit = RequestInit & { json?: unknown };

function defaultSessionExpired(): void {
  // 전체 문서를 새로 불러와 메모리의 인증 상태와 캐시를 비운다(라우터 이동 대신 절대 URL 사용).
  const { origin, pathname, search } = window.location;
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('next', pathname + search);
  window.location.assign(loginUrl);
}

let onSessionExpired: () => void = defaultSessionExpired;

/** refresh 실패(세션 만료) 시 호출할 핸들러를 바꾼다. 기본값은 /login으로 이동. */
export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' && typeof v.message === 'string';
}

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body: unknown = await res.json();
    if (isApiErrorBody(body)) return ApiError.fromBody(res.status, body);
  } catch {
    // JSON이 아닌 본문은 아래 INTERNAL로 처리한다.
  }
  return new ApiError(res.status, 'INTERNAL', res.statusText || 'Unexpected error response');
}

/**
 * fetch를 한 번 수행한다. 인증 쿠키(credentials)와 CSRF 방어 헤더는 항상 강제한다.
 * 네트워크 실패(fetch reject)는 status 0, code `INTERNAL`인 ApiError로 바꿔 던진다.
 */
async function send(path: string, init: HttpInit = {}): Promise<Response> {
  const { json, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  headers.set('X-Requested-With', 'fetch');
  let body = rest.body;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }
  try {
    return await fetch(API_PREFIX + path, { ...rest, body, headers, credentials: 'include' });
  } catch (cause) {
    throw new ApiError(0, 'INTERNAL', cause instanceof Error ? cause.message : 'Network error');
  }
}

let refreshing: Promise<boolean> | null = null;

/**
 * Access 재발급을 요청한다. 진행 중인 호출이 있으면 같은 Promise를 돌려줘서,
 * 한 화면이 동시에 여러 API를 부르다 만료돼도 refresh는 한 번만 나간다.
 * 성공 여부를 boolean으로 돌려주며 던지지 않는다. 끝나면(성공·실패 모두) 슬롯을 비운다.
 */
export function refreshOnce(): Promise<boolean> {
  if (!refreshing) {
    refreshing = send('/auth/refresh', { method: 'POST' })
      .then((res) => res.ok)
      .catch(() => false)
      .then((ok) => {
        if (!ok) onSessionExpired();
        return ok;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * `/api/v1` 기준 상대 경로로 JSON API를 호출한다.
 * - 2xx: 본문을 JSON으로 파싱해 반환(204면 undefined)
 * - 그 외: ApiError. 본문이 ApiErrorBody가 아니면 code `INTERNAL`
 * - 401: 인증 경로가 아니면 refreshOnce() 후 딱 한 번 재시도한다. refresh가 실패하면
 *   원래 401 ApiError를 던진다(세션 만료 핸들러는 refresh 실패당 한 번만 호출된다).
 */
export async function http<T = unknown>(path: string, init?: HttpInit): Promise<T> {
  let res = await send(path, init);

  if (res.status === 401 && !NO_REFRESH_PATHS.has(path)) {
    const original = await toApiError(res);
    if (!(await refreshOnce())) throw original;
    res = await send(path, init);
  }

  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
