import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Role } from '@bo/contracts';
import { renderWithQuery, createTestQueryClient } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { sessionKeys } from '@/entities/session';
import { LoginForm } from './login-form';

const me = { id: 'a', email: 'admin@demo.com', name: 'Admin', role: Role.ADMIN };

describe('LoginForm', () => {
  it('shows validation messages without calling API', async () => {
    let called = false;
    server.use(
      http.post('/api/v1/auth/login', () => {
        called = true;
        return HttpResponse.json(me);
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<LoginForm onSuccess={() => {}} />);
    await user.type(screen.getByLabelText('이메일'), 'not-email');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('이메일 형식이 아닙니다')).toBeInTheDocument();
    expect(screen.getByText('비밀번호를 입력하세요')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('shows invalid-credentials message on 401 INVALID_CREDENTIALS', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ code: 'INVALID_CREDENTIALS', message: 'bad' }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderWithQuery(<LoginForm onSuccess={onSuccess} />);
    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('비밀번호'), 'wrong');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByText('이메일 또는 비밀번호가 올바르지 않습니다')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows generic message on other errors', async () => {
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<LoginForm onSuccess={() => {}} />);
    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('비밀번호'), 'x');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    expect(
      await screen.findByText('로그인에 실패했습니다. 잠시 후 다시 시도해주세요'),
    ).toBeInTheDocument();
  });

  it('calls onSuccess with MeResponse and fills the me cache on success', async () => {
    server.use(http.post('/api/v1/auth/login', () => HttpResponse.json(me)));
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const client = createTestQueryClient();
    renderWithQuery(<LoginForm onSuccess={onSuccess} />, { client });
    await user.type(screen.getByLabelText('이메일'), 'admin@demo.com');
    await user.type(screen.getByLabelText('비밀번호'), 'demo1234!');
    await user.click(screen.getByRole('button', { name: '로그인' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(me));
    expect(client.getQueryData(sessionKeys.me)).toEqual(me);
  });

  it('demo button fills fields without submitting', async () => {
    let called = false;
    server.use(
      http.post('/api/v1/auth/login', () => {
        called = true;
        return HttpResponse.json(me);
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<LoginForm onSuccess={() => {}} />);
    await user.click(screen.getByRole('button', { name: '매니저' }));
    expect(screen.getByLabelText('이메일')).toHaveValue('manager@demo.com');
    expect(screen.getByLabelText('비밀번호')).toHaveValue('demo1234!');
    expect(called).toBe(false);
  });
});
