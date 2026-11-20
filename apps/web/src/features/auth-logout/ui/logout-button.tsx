'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { http } from '@/shared/api';
import { Button } from '@/shared/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await http('/auth/logout', { method: 'POST' });
    } catch {
      // 실패해도 클라이언트 상태는 정리한다(쿠키는 서버가 지운다).
    } finally {
      queryClient.clear();
      router.replace('/login');
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={logout}>
      <LogOut />
      로그아웃
    </Button>
  );
}
