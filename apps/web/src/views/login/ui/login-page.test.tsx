import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Role } from '@bo/contracts';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { LoginPage } from './login-page';

const replace = vi.fn();
let next: string | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(next === null ? '' : { next }),
}));

async function login() {
  server.use(
    http.post('/api/v1/auth/login', () =>
      HttpResponse.json({ id: 'a', email: 'admin@demo.com', name: 'A', role: Role.ADMIN }),
    ),
  );
  const user = userEvent.setup();
  renderWithQuery(<LoginPage />);
  await user.type(screen.getByLabelText('이메일'), 'admin@demo.com');
  await user.type(screen.getByLabelText('비밀번호'), 'demo1234!');
  await user.click(screen.getByRole('button', { name: '로그인' }));
}

describe('LoginPage', () => {
  beforeEach(() => replace.mockClear());

  it('renders title and subtitle', () => {
    next = null;
    renderWithQuery(<LoginPage />);
    expect(screen.getByText('커머스 백오피스')).toBeInTheDocument();
    expect(screen.getByText('관리자 로그인')).toBeInTheDocument();
  });

  it('redirects to /dashboard when next is an external URL (//evil.com)', async () => {
    next = '//evil.com';
    await login();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('redirects to a safe internal next', async () => {
    next = '/orders?status=PENDING';
    await login();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/orders?status=PENDING'));
  });
});
