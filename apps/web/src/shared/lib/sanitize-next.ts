const DEFAULT_NEXT = '/dashboard';

function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * 로그인 후 이동할 `next` 값을 앱 내부 경로로 제한한다(open redirect 방어).
 *
 * searchParams에서 이미 디코딩된 문자열이 들어온다고 보고 디코딩은 하지 않는다.
 * 통과 조건: `/`로 시작하고, `//`로 시작하지 않으며, 역슬래시와 제어 문자가 없고,
 * 파싱해도 같은 origin에 머무는 경우. 그 밖은 모두 `/dashboard`로 돌린다.
 */
export function sanitizeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_NEXT;
  if (raw.includes('\\') || hasControlChar(raw)) return DEFAULT_NEXT;
  try {
    if (new URL(raw, 'http://x').origin !== 'http://x') return DEFAULT_NEXT;
  } catch {
    return DEFAULT_NEXT;
  }
  return raw;
}
