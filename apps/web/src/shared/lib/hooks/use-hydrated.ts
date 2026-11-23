import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** 서버 렌더와 하이드레이션 중에는 false, 하이드레이션이 끝난 뒤(클라이언트)에는 true. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
