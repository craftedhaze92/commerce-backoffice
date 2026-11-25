import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Role, type Paginated, type UserListItem } from '@bo/contracts';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { UsersPage } from './users-page';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const adminMe = { id: 'a', email: 'admin@demo.com', name: 'Admin', role: Role.ADMIN };
const rows: UserListItem[] = [
  { ...adminMe, isActive: true, createdAt: '2026-01-05T00:00:00.000Z' },
  {
    id: 'b',
    email: 'viewer@demo.com',
    name: 'Viewer',
    role: Role.VIEWER,
    isActive: false,
    createdAt: '2026-02-10T15:30:00.000Z',
  },
];

function page(p: number, totalPages = 2): Paginated<UserListItem> {
  return { items: rows, meta: { page: p, size: 20, total: 40, totalPages } };
}

describe('UsersPage', () => {
  beforeEach(() => {
    replace.mockClear();
    server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(adminMe)));
  });

  it('renders rows from Paginated response', async () => {
    server.use(http.get('/api/v1/users', () => HttpResponse.json(page(1))));
    renderWithQuery(<UsersPage />);
    expect(await screen.findByText('admin@demo.com')).toBeInTheDocument();
    expect(screen.getByText('viewer@demo.com')).toBeInTheDocument();
    expect(screen.getByText('활성')).toBeInTheDocument();
    expect(screen.getByText('비활성')).toBeInTheDocument();
    expect(screen.getByText('2026.01.05')).toBeInTheDocument();
    // 2026-02-10T15:30Z = KST 2026-02-11
    expect(screen.getByText('2026.02.11')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects to /forbidden on 403', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ code: 'FORBIDDEN', message: 'no' }, { status: 403 }),
      ),
    );
    renderWithQuery(<UsersPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/forbidden'));
  });

  it('redirects to /forbidden when me is not ADMIN without fetching users', async () => {
    let called = false;
    server.use(
      http.get('/api/v1/auth/me', () => HttpResponse.json({ ...adminMe, role: Role.VIEWER })),
      http.get('/api/v1/users', () => {
        called = true;
        return HttpResponse.json(page(1));
      }),
    );
    renderWithQuery(<UsersPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/forbidden'));
    expect(called).toBe(false);
  });

  it('paginates with prev/next buttons disabled at bounds', async () => {
    const pages: string[] = [];
    server.use(
      http.get('/api/v1/users', ({ request }) => {
        const p = Number(new URL(request.url).searchParams.get('page'));
        pages.push(`${p}:${new URL(request.url).searchParams.get('size')}`);
        return HttpResponse.json(page(p));
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<UsersPage />);
    await screen.findByText('admin@demo.com');
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '이전' })).toBeEnabled());
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(pages).toEqual(['1:20', '2:20']);
  });

  it('shows an error row and refetches on retry', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v1/users', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              { statusCode: 500, code: 'INTERNAL', message: 'boom' },
              { status: 500 },
            )
          : HttpResponse.json(page(1));
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<UsersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('사용자 목록을 불러오지 못했습니다');
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('admin@demo.com')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an empty state and 1 / 1 when there are no users', async () => {
    server.use(
      http.get('/api/v1/users', () =>
        HttpResponse.json({ items: [], meta: { page: 1, size: 20, total: 0, totalPages: 0 } }),
      ),
    );
    renderWithQuery(<UsersPage />);
    expect(await screen.findByText('사용자가 없습니다')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  describe('manage rows', () => {
    const me = { ...adminMe };
    const manager: UserListItem = {
      id: 'c',
      email: 'manager@example.com',
      name: 'Manager',
      role: Role.MANAGER,
      isActive: true,
      createdAt: '2026-03-01T00:00:00.000Z',
    };
    let state: UserListItem[];
    let patches: { id: string; body: unknown }[];

    function useUsersServer(patchResponse?: () => Response) {
      server.use(
        http.get('/api/v1/users', () =>
          HttpResponse.json({
            items: state,
            meta: { page: 1, size: 20, total: state.length, totalPages: 1 },
          }),
        ),
        http.patch('/api/v1/users/:id', async ({ request, params }) => {
          const body = (await request.json()) as Partial<UserListItem>;
          patches.push({ id: String(params.id), body });
          if (patchResponse) return patchResponse();
          state = state.map((u) => (u.id === params.id ? { ...u, ...body } : u));
          return HttpResponse.json(state.find((u) => u.id === params.id));
        }),
      );
    }

    beforeEach(() => {
      state = [{ ...me, isActive: true, createdAt: '2026-01-05T00:00:00.000Z' }, manager];
      patches = [];
    });

    it('changing role PATCHes {role} and refreshes the row', async () => {
      useUsersServer();
      const user = userEvent.setup();
      renderWithQuery(<UsersPage />);
      const select = await screen.findByRole('combobox', { name: 'Manager 역할' });
      await user.selectOptions(select, '뷰어');
      await waitFor(() => expect(patches).toEqual([{ id: 'c', body: { role: 'VIEWER' } }]));
      await waitFor(() =>
        expect(screen.getByRole('combobox', { name: 'Manager 역할' })).toHaveValue('VIEWER'),
      );
    });

    it('deactivate asks for confirmation, PATCHes {isActive:false}; activate does not ask', async () => {
      useUsersServer();
      const user = userEvent.setup();
      renderWithQuery(<UsersPage />);
      await user.click(await screen.findByRole('button', { name: 'Manager 비활성화' }));
      expect(patches).toEqual([]);
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: '비활성화' }));
      await waitFor(() => expect(patches).toEqual([{ id: 'c', body: { isActive: false } }]));
      const activate = await screen.findByRole('button', { name: 'Manager 활성화' });
      await user.click(activate);
      await waitFor(() => expect(patches).toHaveLength(2));
      expect(patches[1]).toEqual({ id: 'c', body: { isActive: true } });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('own row: role select and toggle disabled with title', async () => {
      useUsersServer();
      renderWithQuery(<UsersPage />);
      const select = await screen.findByRole('combobox', { name: 'Admin 역할' });
      await waitFor(() => expect(select).toBeDisabled());
      expect(select).toHaveAttribute('title', '본인 계정은 변경할 수 없습니다');
      const toggle = screen.getByRole('button', { name: 'Admin 비활성화' });
      expect(toggle).toBeDisabled();
      expect(toggle).toHaveAttribute('title', '본인 계정은 변경할 수 없습니다');
      expect(screen.getByRole('combobox', { name: 'Manager 역할' })).toBeEnabled();
    });

    it('409 LAST_ADMIN and 403 DEMO_PROTECTED show their messages under the row', async () => {
      let next: 'last' | 'demo' = 'last';
      useUsersServer(() =>
        next === 'last'
          ? HttpResponse.json(
              {
                statusCode: 409,
                code: 'CONFLICT',
                message: 'Cannot demote the last admin',
                details: { reason: 'LAST_ADMIN' },
              },
              { status: 409 },
            )
          : HttpResponse.json(
              { statusCode: 403, code: 'DEMO_PROTECTED', message: 'demo' },
              { status: 403 },
            ),
      );
      const user = userEvent.setup();
      renderWithQuery(<UsersPage />);
      const select = await screen.findByRole('combobox', { name: 'Manager 역할' });
      await user.selectOptions(select, '뷰어');
      expect(await screen.findByRole('alert')).toHaveTextContent(
        '마지막 관리자는 강등하거나 비활성화할 수 없습니다',
      );
      expect(screen.getByRole('combobox', { name: 'Manager 역할' })).toHaveValue('MANAGER');
      next = 'demo';
      await user.selectOptions(screen.getByRole('combobox', { name: 'Manager 역할' }), '뷰어');
      expect(await screen.findByText('데모 계정은 변경할 수 없습니다.')).toBeInTheDocument();
      expect(screen.queryByText('Cannot demote the last admin')).not.toBeInTheDocument();
    });

    it('shows the 사용자 추가 button for admins', async () => {
      useUsersServer();
      renderWithQuery(<UsersPage />);
      expect(await screen.findByRole('button', { name: '사용자 추가' })).toBeInTheDocument();
    });
  });
});
