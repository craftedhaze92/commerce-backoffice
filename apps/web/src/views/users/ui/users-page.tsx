'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { can } from '@bo/contracts';
import { useMe } from '@/entities/session';
import { useUsers } from '@/entities/user';
import { ApiError } from '@/shared/api';
import { kst } from '@/shared/lib/dayjs';
import { ROLE_LABEL } from '@/shared/lib/role-label';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function UsersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const me = useMe();
  const forbidden = me.data !== undefined && !can(me.data.role, 'user:manage');
  const users = useUsers(page, { enabled: me.data !== undefined && !forbidden });
  const apiForbidden = users.error instanceof ApiError && users.error.status === 403;

  useEffect(() => {
    if (forbidden || apiForbidden) router.replace('/forbidden');
  }, [forbidden, apiForbidden, router]);

  const totalPages = users.data?.meta.totalPages ?? 1;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-lg font-bold">사용자</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>이름</TableHead>
            <TableHead>이메일</TableHead>
            <TableHead>역할</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>가입일</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.data
            ? users.data.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? 'default' : 'secondary'}>
                      {u.isActive ? '활성' : '비활성'}
                    </Badge>
                  </TableCell>
                  <TableCell>{kst(u.createdAt).format('YYYY.MM.DD')}</TableCell>
                </TableRow>
              ))
            : [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {users.isError && !apiForbidden && (
        <p role="alert" className="text-destructive text-sm">
          사용자 목록을 불러오지 못했습니다
        </p>
      )}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          이전
        </Button>
        <span className="text-muted-foreground text-sm">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </Button>
      </div>
    </section>
  );
}
