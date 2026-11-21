import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

/**
 * next/navigation 목. replace()가 실제로 쿼리를 바꾸고 구독자를 다시 그리게 해서
 * URL 상태 훅이 화면과 함께 움직이는 모습을 테스트할 수 있다.
 * vi.mock 팩토리에서 `await import`로 가져다 쓴다.
 */
let search = '';
const listeners = new Set<() => void>();

export const navReplace = vi.fn((url: string) => {
  search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  listeners.forEach((l) => l());
});

export function setMockSearch(next: string): void {
  search = next;
  navReplace.mockClear();
}

export function getMockSearch(): string {
  return search;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const navigationMock = {
  useRouter: () => ({ replace: navReplace, push: navReplace }),
  usePathname: () => '/products',
  useSearchParams: () => {
    const s = useSyncExternalStore(subscribe, () => search);
    return new URLSearchParams(s);
  },
};
