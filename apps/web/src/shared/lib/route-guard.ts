const LOGIN_PATH = '/login';
const HOME_PATH = '/dashboard';

function isLoginPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`);
}

/**
 * 세션 쿠키 유무만으로 라우트를 보호한다(유효성 검증은 API가 맡는다).
 * `/login` 외 전부가 보호 경로다. 정적 파일·`/_next`·`/api`는 proxy matcher가 미리 제외한다.
 *
 * @returns 이동해야 할 경로. 그대로 통과면 null
 */
export function resolveRouteRedirect(
  pathname: string,
  search: string,
  hasSessionCookie: boolean,
): string | null {
  if (isLoginPath(pathname)) return hasSessionCookie ? HOME_PATH : null;
  if (hasSessionCookie) return null;
  return `${LOGIN_PATH}?next=${encodeURIComponent(pathname + search)}`;
}
