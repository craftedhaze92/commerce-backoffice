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
      <Card className="w-full max-w-md gap-8 py-10">
        <CardHeader className="px-8">
          <CardTitle className="text-title">커머스 백오피스</CardTitle>
          <CardDescription className="text-[15px]">관리자 로그인</CardDescription>
        </CardHeader>
        <CardContent className="px-8">
          <LoginForm onSuccess={() => router.replace(sanitizeNext(next))} />
        </CardContent>
      </Card>
    </main>
  );
}
