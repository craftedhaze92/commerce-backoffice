import type { ApiErrorBody } from '@bo/contracts';
import { ApiError } from './api-error';

const API_PREFIX = '/api/v1';
/** 401이어도 refresh를 시도하지 않는 인증 경로 */
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

export type HttpInit = RequestInit & { json?: unknown };

/**
 * 기본 세션 만료 핸들러: /login으로 전체 이동한다.
 * 이미 /login 화면이면 이동하지 않는다. 로그인 화면이 인증 API를 부르다 401이 나면
 * 이동 -> 재로드 -> 401이 무한히 반복되기 때문이다. `/`에서는 next를 붙이지 않는다.
 * `reason=expired`는 proxy가 (아직 남은) bo_at 쿠키를 보고 /login을 /dashboard로 되돌리는 루프를 막는다.
 */
export function defaultSessionExpired(): void {
  const { origin, pathname, search } = window.location;
  if (pathname === '/login' || pathname.startsWith('/login/')) return;
  // 전체 문서를 새로 불러와 메모리의 인증 상태와 캐시를 비운다(라우터 이동 대신 절대 URL 사용).
  const loginUrl = new URL('/login', origin);
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname + search);
  loginUrl.searchParams.set('reason', 'expired');
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
 * `http`와 `httpBlob`이 공유하는 전송 코어. 전송하고, 401이면(인증 경로 제외)
 * refreshOnce() 후 딱 한 번 재시도하며, 비정상 응답은 ApiError로 던진다.
 * refresh가 실패하면 원래 401 ApiError를 던진다(세션 만료 핸들러는 refresh 실패당 한 번만 호출된다).
 *
 * 주의: ReadableStream 같은 일회성 body는 401 재시도 때 다시 보낼 수 없다(string/JSON body만 안전).
 * 또한 refresh가 이미 끝난 뒤에 도착한 401은 refresh를 한 번 더 일으킨다(토큰이 한 번 더 회전할 뿐 무해).
 */
async function request(path: string, init?: HttpInit): Promise<Response> {
  let res = await send(path, init);

  if (res.status === 401 && !NO_REFRESH_PATHS.has(path)) {
    const original = await toApiError(res);
    if (!(await refreshOnce())) throw original;
    res = await send(path, init);
  }

  if (!res.ok) throw await toApiError(res);
  return res;
}

/**
 * `/api/v1` 기준 상대 경로로 JSON API를 호출한다.
 * - 2xx: 본문을 JSON으로 파싱해 반환(204면 undefined)
 * - 그 외: ApiError. 본문이 ApiErrorBody가 아니면 code `INTERNAL`
 * - 401: 인증 경로가 아니면 refreshOnce() 후 딱 한 번 재시도한다.
 */
export async function http<T = unknown>(path: string, init?: HttpInit): Promise<T> {
  const res = await request(path, init);
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    // 2xx인데 본문이 비었거나 JSON이 아니면 SyntaxError 대신 ApiError로 정규화한다.
    throw new ApiError(res.status, 'INTERNAL', 'Invalid JSON in successful response');
  }
}

/** 파일 다운로드용. `http`와 같은 전송·401 재시도·ApiError 정규화를 쓰고 본문을 Blob으로 돌려준다. */
export async function httpBlob(
  path: string,
  init?: HttpInit,
): Promise<{ blob: Blob; contentDisposition: string | null }> {
  const res = await request(path, init);
  try {
    return { blob: await res.blob(), contentDisposition: res.headers.get('Content-Disposition') };
  } catch {
    // 본문을 끝까지 읽지 못하면(연결이 끊긴 불완전한 파일 등) 성공으로 돌려주지 않는다.
    throw new ApiError(res.status, 'INTERNAL', 'Failed to read response body');
  }
}
