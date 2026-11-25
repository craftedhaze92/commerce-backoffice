import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { CreateUserDialog } from './create-user-dialog';

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  renderWithQuery(<CreateUserDialog />);
  await user.click(screen.getByRole('button', { name: '사용자 추가' }));
  return screen.findByRole('dialog', { name: '사용자 추가' });
}

describe('CreateUserDialog', () => {
  it('validates email/name/password (8–72) inline', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post('/api/v1/users', () => {
        called = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await openDialog(user);
    await user.type(screen.getByLabelText('이메일'), 'not-an-email');
    await user.type(screen.getByLabelText('초기 비밀번호'), 'short');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText('이메일 형식이 올바르지 않습니다')).toBeInTheDocument();
    expect(screen.getByText('이름을 입력하세요')).toBeInTheDocument();
    expect(screen.getByText('비밀번호는 8자 이상이어야 합니다')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('rejects a password longer than 72 chars', async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await user.type(screen.getByLabelText('이메일'), 'a@b.com');
    await user.type(screen.getByLabelText('이름'), '새 사용자');
    await user.type(screen.getByLabelText('초기 비밀번호'), 'x'.repeat(73));
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText('비밀번호는 72자 이하여야 합니다')).toBeInTheDocument();
  });

  it('submits normalized payload; shows 사용자를 추가했습니다', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      http.post('/api/v1/users', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'n' }, { status: 201 });
      }),
    );
    await openDialog(user);
    await user.type(screen.getByLabelText('이메일'), '  New@Example.COM ');
    await user.type(screen.getByLabelText('이름'), '  새 사용자 ');
    await user.selectOptions(screen.getByLabelText('역할'), '매니저');
    await user.type(screen.getByLabelText('초기 비밀번호'), 'password1!');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByRole('status')).toHaveTextContent('사용자를 추가했습니다');
    expect(body).toEqual({
      email: 'new@example.com',
      name: '새 사용자',
      role: 'MANAGER',
      password: 'password1!',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('409 EMAIL_TAKEN shows 이미 사용 중인 이메일입니다 on the email field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v1/users', () =>
        HttpResponse.json(
          { statusCode: 409, code: 'CONFLICT', message: 'x', details: { reason: 'EMAIL_TAKEN' } },
          { status: 409 },
        ),
      ),
    );
    await openDialog(user);
    await user.type(screen.getByLabelText('이메일'), 'dup@example.com');
    await user.type(screen.getByLabelText('이름'), '중복');
    await user.type(screen.getByLabelText('초기 비밀번호'), 'password1!');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText('이미 사용 중인 이메일입니다')).toBeInTheDocument();
    expect(screen.getByLabelText(/^이메일/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('other failures show the generic Korean message', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('/api/v1/users', () =>
        HttpResponse.json(
          { statusCode: 500, code: 'INTERNAL', message: 'db exploded' },
          { status: 500 },
        ),
      ),
    );
    await openDialog(user);
    await user.type(screen.getByLabelText('이메일'), 'a@example.com');
    await user.type(screen.getByLabelText('이름'), '이름');
    await user.type(screen.getByLabelText('초기 비밀번호'), 'password1!');
    await user.click(screen.getByRole('button', { name: '추가' }));
    expect(await screen.findByText(/일시적인 오류가 발생했습니다/)).toBeInTheDocument();
    expect(screen.queryByText('db exploded')).not.toBeInTheDocument();
  });
});
