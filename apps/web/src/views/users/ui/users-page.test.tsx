import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
});
