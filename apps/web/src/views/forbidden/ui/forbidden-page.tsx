import Link from 'next/link';
import { Button } from '@/shared/ui/button';

export function ForbiddenPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <h1 className="text-lg font-bold">접근 권한이 없습니다</h1>
      <Button asChild>
        <Link href="/dashboard">대시보드로 이동</Link>
      </Button>
    </main>
  );
}
