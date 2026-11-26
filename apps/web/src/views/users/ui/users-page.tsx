'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { can } from '@bo/contracts';
import { useSessionMe } from '@/entities/session';
import { useUsers } from '@/entities/user';
import { CreateUserDialog } from '@/features/create-user';
import { UserActiveToggle, UserRoleSelect } from '@/features/manage-user';
import { ApiError } from '@/shared/api';
import { kst } from '@/shared/lib/dayjs';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DataPagination } from '@/shared/ui/data-pagination';
import { TableSkeletonRows } from '@/shared/ui/table-skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export function UsersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const me = useSessionMe();
  const forbidden = me.data !== undefined && !can(me.data.role, 'user:manage');
  const users = useUsers(page, { enabled: me.data !== undefined && !forbidden });
  const apiForbidden = users.error instanceof ApiError && users.error.status === 403;

  useEffect(() => {
    if (forbidden || apiForbidden) router.replace('/forbidden');
  }, [forbidden, apiForbidden, router]);

  const totalPages = users.data?.meta.totalPages ?? 1;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title">사용자</h1>
        {me.data !== undefined && !forbidden && <CreateUserDialog />}
      </div>
      <div className="sheet flex flex-col gap-5 p-4 md:p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead>관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.isPending ? (
              <TableSkeletonRows
                rows={3}
                testId="user-skeleton-row"
                cells={['text', 'text', 'badge', 'badge', 'text', 'badge']}
              />
            ) : users.isError ? (
              !apiForbidden && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div role="alert" className="flex items-center justify-center gap-3 py-4">
                      <span className="text-destructive text-sm">
                        사용자 목록을 불러오지 못했습니다
                      </span>
                      <Button variant="outline" size="sm" onClick={() => void users.refetch()}>
                        다시 시도
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            ) : users.data && users.data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-6 text-center text-sm">
                  사용자가 없습니다
                </TableCell>
              </TableRow>
            ) : (
              users.data?.items.map((u) => {
                const isSelf = u.id === me.data?.id;
                const setError = (message: string | null) =>
                  setRowErrors((prev) => {
                    const next = { ...prev };
                    if (message === null) delete next[u.id];
                    else next[u.id] = message;
                    return next;
                  });
                return (
                  <Fragment key={u.id}>
                    <TableRow>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <UserRoleSelect user={u} isSelf={isSelf} onError={setError} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.isActive ? 'default' : 'secondary'}>
                          {u.isActive ? '활성' : '비활성'}
                        </Badge>
                      </TableCell>
                      <TableCell>{kst(u.createdAt).format('YYYY.MM.DD')}</TableCell>
                      <TableCell>
                        <UserActiveToggle user={u} isSelf={isSelf} onError={setError} />
                      </TableCell>
                    </TableRow>
                    {rowErrors[u.id] && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <p role="alert" className="text-destructive text-sm">
                            {rowErrors[u.id]}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
        <DataPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </section>
  );
}
