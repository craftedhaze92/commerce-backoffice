'use client';

import { useState } from 'react';
import type { UserListItem } from '@bo/contracts';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { Button } from '@/shared/ui/button';
import { SELF_CHANGE_TITLE, updateUserErrorMessage, useUpdateUser } from '../model/use-update-user';

interface UserActiveToggleProps {
  user: UserListItem;
  isSelf: boolean;
  onError: (message: string | null) => void;
}

export function UserActiveToggle({ user, isSelf, onError }: UserActiveToggleProps) {
  const [confirming, setConfirming] = useState(false);
  const update = useUpdateUser(user.id);

  function change(isActive: boolean) {
    update.mutate(
      { isActive },
      {
        onSuccess: () => onError(null),
        onError: (err) => onError(updateUserErrorMessage(err)),
        onSettled: () => setConfirming(false),
      },
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={`${user.name} ${user.isActive ? '비활성화' : '활성화'}`}
        disabled={isSelf || update.isPending}
        title={isSelf ? SELF_CHANGE_TITLE : undefined}
        onClick={() => (user.isActive ? setConfirming(true) : change(true))}
      >
        {user.isActive ? '비활성화' : '활성화'}
      </Button>
      <AlertDialog
        open={confirming}
        onOpenChange={(next) => {
          if (!update.isPending) setConfirming(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>‘{user.name}’ 사용자를 비활성화할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              비활성화하면 이 사용자는 즉시 로그아웃되고 다시 로그인할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>취소</AlertDialogCancel>
            <Button variant="destructive" disabled={update.isPending} onClick={() => change(false)}>
              {update.isPending ? '처리 중...' : '비활성화'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
