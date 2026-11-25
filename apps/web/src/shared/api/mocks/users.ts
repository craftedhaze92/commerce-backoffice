import { Role, type CreateUserInput, type UpdateUserInput, type UserListItem } from '@bo/contracts';
import { http, HttpResponse } from 'msw';

/** 사용자 변경 API 기본 핸들러. 목록(GET)은 테스트가 server.use()로 정한다. */
export const userHandlers = [
  http.post('/api/v1/users', async ({ request }) => {
    const body = (await request.json()) as CreateUserInput;
    const created: UserListItem = {
      id: 'user-new',
      email: body.email,
      name: body.name,
      role: body.role,
      isActive: true,
      createdAt: '2026-11-25T00:00:00.000Z',
    };
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch('/api/v1/users/:id', async ({ request, params }) => {
    const body = (await request.json()) as UpdateUserInput;
    const updated: UserListItem = {
      id: String(params.id),
      email: 'user@example.com',
      name: body.name ?? 'User',
      role: body.role ?? Role.VIEWER,
      isActive: body.isActive ?? true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    return HttpResponse.json(updated);
  }),
];
