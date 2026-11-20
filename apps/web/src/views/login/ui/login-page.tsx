'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { LoginForm } from '@/features/auth-login';
import { sanitizeNext } from '@/shared/lib/sanitize-next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next');

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold">커머스 백오피스</CardTitle>
          <CardDescription>관리자 로그인</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm onSuccess={() => router.replace(sanitizeNext(next))} />
        </CardContent>
      </Card>
    </main>
  );
}
