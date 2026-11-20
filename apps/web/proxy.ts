import { NextResponse, type NextRequest } from 'next/server';
import { resolveRouteRedirect } from '@/shared/lib/route-guard';

const ACCESS_COOKIE = 'bo_at';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = resolveRouteRedirect(pathname, search, request.cookies.has(ACCESS_COOKIE));
  if (!target) return NextResponse.next();
  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  // _next, api/, favicon.ico, 확장자가 있는 정적 파일은 제외.
  // `api`가 아니라 `api/`로 막아야 `/apply` 같은 일반 페이지가 가드를 우회하지 않는다.
  matcher: ['/((?!_next|api/|favicon\\.ico|.*\\..*).*)'],
};
