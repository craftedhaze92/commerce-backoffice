import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Role } from '@bo/contracts';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { AdminShell } from './admin-shell';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/dashboard',
}));

describe('AdminShell', () => {
  it('shows skeleton while loading, then name, role badge and menu by role', async () => {
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ id: 'a', email: 'a@b.c', name: '홍길동', role: Role.MANAGER }),
      ),
    );
    renderWithQuery(
      <AdminShell>
        <p>본문</p>
      </AdminShell>,
    );
    expect(screen.getByTestId('sidebar-skeleton')).toBeInTheDocument();
    expect(await screen.findByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('매니저')).toBeInTheDocument();
    expect(screen.getByText('본문')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /사용자/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /대시보드/ })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /상품/ })).toHaveAttribute('href', '/products');
    expect(screen.getByRole('link', { name: /주문/ })).toHaveAttribute('href', '/orders');
    expect(screen.queryByText('준비 중')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument();
  });
});
