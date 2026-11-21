import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type ToggleableColumn = 'thumbnail' | 'category' | 'updatedAt';
export type ColumnVisibility = Record<ToggleableColumn, boolean>;

const DEFAULT_VISIBLE: ColumnVisibility = { thumbnail: true, category: true, updatedAt: true };

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
      partialize: (s) => ({ visible: s.visible }),
    },
  ),
);
