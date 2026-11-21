import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type ToggleableColumn = 'thumbnail' | 'category' | 'updatedAt';
export type ColumnVisibility = Record<ToggleableColumn, boolean>;

const DEFAULT_VISIBLE: ColumnVisibility = { thumbnail: true, category: true, updatedAt: true };
const COLUMN_KEYS = Object.keys(DEFAULT_VISIBLE) as ToggleableColumn[];

/** localStorage 접근이 막힌 환경(프라이빗 모드 등)에서도 터지지 않게 감싼다. */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      // 저장 실패는 무시한다. 설정이 새로고침 후 초기화될 뿐이다.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // 위와 같다.
    }
  },
};

interface ColumnVisibilityState {
  visible: ColumnVisibility;
  setVisible: (column: ToggleableColumn, value: boolean) => void;
  reset: () => void;
}

export const useColumnVisibility = create<ColumnVisibilityState>()(
  persist(
    (set) => ({
      visible: DEFAULT_VISIBLE,
      setVisible: (column, value) => set((s) => ({ visible: { ...s.visible, [column]: value } })),
      reset: () => set({ visible: DEFAULT_VISIBLE }),
    }),
    {
      name: 'bo:product-table-columns',
      storage: createJSONStorage(() => safeStorage),
      version: 1,
      // 서버 렌더와 첫 클라이언트 렌더를 맞추려고 마운트 후 useHydrateColumnVisibility가 복원한다.
      skipHydration: true,
      partialize: (s) => ({ visible: s.visible }),
      // 나중에 컬럼이 추가돼도 저장값에 없는 키는 기본값을 쓴다.
      merge: (persisted, current) => {
        // 저장값은 사용자가 건드릴 수 있으니 알려진 키 중 boolean인 것만 받는다.
        const stored: unknown = (persisted as { visible?: unknown } | null | undefined)?.visible;
        const visible = { ...DEFAULT_VISIBLE };
        if (typeof stored === 'object' && stored !== null) {
          for (const key of COLUMN_KEYS) {
            const value = (stored as Record<string, unknown>)[key];
            if (typeof value === 'boolean') visible[key] = value;
          }
        }
        return { ...current, visible };
      },
    },
  ),
);

/** 마운트 직후 저장된 설정을 복원한다. skipHydration이라 SSR 결과와 첫 렌더가 같다. */
export function useHydrateColumnVisibility(): void {
  useEffect(() => {
    void useColumnVisibility.persist.rehydrate();
  }, []);
}
