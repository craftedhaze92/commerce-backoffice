'use client';

import { CheckCircle2Icon } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { create } from 'zustand';
import { cn } from '@/shared/lib/utils';

/** 토스트가 화면에 머무는 시간(ms). 짧은 완료 알림이라 길게 두지 않는다. */
export const TOAST_DURATION_MS = 3000;

interface ToastItem {
  id: number;
  message: string;
}

interface ToastStore {
  items: ToastItem[];
  push: (message: string) => void;
  remove: (id: number) => void;
}

let nextId = 0;

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (message) => set((s) => ({ items: [...s.items, { id: ++nextId, message }] })),
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

/**
 * 작업이 끝났음을 알리는 짧은 알림을 띄운다. 컴포넌트 밖(뮤테이션 콜백 등)에서도 부를 수 있다.
 * 문구는 버튼 이름과 같은 동사로 쓴다(예: 저장 → "변경 사항을 저장했습니다").
 */
export function toast(message: string): void {
  useToastStore.getState().push(message);
}

/** 테스트 사이에 남은 알림을 비운다. */
export function resetToasts(): void {
  useToastStore.setState({ items: [] });
}

/**
 * 토스트를 그리는 자리. 앱에서 한 번만 둔다(관리자 화면 껍데기).
 * 화면 아래 가운데에 어두운 알약 모양으로 잠깐 떴다가 사라지고, 스크린리더에는 status로 읽힌다.
 */
export function Toaster() {
  const items = useToastStore((s) => s.items);
  const remove = useToastStore((s) => s.remove);

  return (
    <ToastPrimitive.Provider duration={TOAST_DURATION_MS} swipeDirection="down">
      {items.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          onOpenChange={(open) => {
            if (!open) remove(t.id);
          }}
          className={cn(
            'bg-foreground text-background flex items-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            'data-[swipe=move]:translate-y-(--radix-toast-swipe-move-y) motion-reduce:animate-none',
          )}
        >
          <CheckCircle2Icon aria-hidden className="text-brand-weak size-5 shrink-0" />
          <ToastPrimitive.Title>{t.message}</ToastPrimitive.Title>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-6 left-1/2 z-[100] flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
