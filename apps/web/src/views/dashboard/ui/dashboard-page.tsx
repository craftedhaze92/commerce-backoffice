'use client';

import { useMe } from '@/entities/session';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';

export function DashboardPage() {
  const { data: me } = useMe();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{me ? `${me.name}님, 안녕하세요` : '안녕하세요'}</CardTitle>
        <CardDescription>커머스 백오피스</CardDescription>
      </CardHeader>
      <CardContent>대시보드는 M4에서 구현됩니다</CardContent>
    </Card>
  );
}
