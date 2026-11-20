import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createTestQueryClient, renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { LogoutButton } from './logout-button';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

describe('LogoutButton', () => {
  beforeEach(() => replace.mockClear());

  it('calls logout, clears query cache and navigates to /login', async () => {
    let called = false;
    server.use(
      http.post('/api/v1/auth/logout', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = createTestQueryClient();
    client.setQueryData(['x'], 1);
    renderWithQuery(<LogoutButton />, { client });
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(called).toBe(true);
    expect(client.getQueryData(['x'])).toBeUndefined();
  });

  it('clears cache and navigates to /login even if API fails', async () => {
    server.use(
      http.post('/api/v1/auth/logout', () =>
        HttpResponse.json({ code: 'INTERNAL', message: 'boom' }, { status: 500 }),
      ),
    );
    const client = createTestQueryClient();
    client.setQueryData(['x'], 1);
    renderWithQuery(<LogoutButton />, { client });
    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(client.getQueryData(['x'])).toBeUndefined();
  });
});
