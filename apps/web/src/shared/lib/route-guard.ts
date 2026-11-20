import { sanitizeNext } from './sanitize-next';

const LOGIN_PATH = '/login';

function isLoginPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
}

/**
 * 세션 쿠키 유무만으로 라우트를 보호한다(유효성 검증은 API가 맡는다).
 * `/login` 외 전부가 보호 경로다. 정적 파일·`/_next`·`/api/`는 proxy matcher가 미리 제외한다.
 * 쿠키가 있는 채로 `/login`에 오면 `next`(sanitize)로 보내되, `reason=expired`면 그대로 보여준다.
 * 이 예외가 없으면 bo_at만 남고 refresh가 죽은 상태에서 /login <-> /dashboard를 무한 반복한다.
 *
 * @returns 이동해야 할 경로. 그대로 통과면 null
 */
export function resolveRouteRedirect(
  pathname: string,
  search: string,
  hasSessionCookie: boolean,
): string | null {
  if (isLoginPath(pathname)) {
    if (!hasSessionCookie) return null;
    const params = new URLSearchParams(search);
    if (params.get('reason') === 'expired') return null;
    return sanitizeNext(params.get('next'));
  }
  if (hasSessionCookie) return null;
  return `${LOGIN_PATH}?next=${encodeURIComponent(pathname + search)}`;
}
