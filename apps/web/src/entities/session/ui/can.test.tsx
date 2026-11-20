import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Role } from '@bo/contracts';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { Can } from './can';

describe('Can', () => {
  it('Can hides children when VIEWER lacks product:write', async () => {
    renderWithQuery(
      <Can permission="product:write" fallback={<span>읽기 전용</span>}>
        <button>상품 등록</button>
      </Can>,
    );
    expect(await screen.findByText('읽기 전용')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '상품 등록' })).not.toBeInTheDocument();
  });

  it('Can shows children for MANAGER product:write', async () => {
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ id: 'm', email: 'manager@demo.com', name: 'M', role: Role.MANAGER }),
      ),
    );
    renderWithQuery(
      <Can permission="product:write">
        <button>상품 등록</button>
      </Can>,
    );
    expect(await screen.findByRole('button', { name: '상품 등록' })).toBeInTheDocument();
  });

  it('renders fallback while me is unavailable (401)', async () => {
    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json({ code: 'UNAUTHORIZED', message: 'x' }, { status: 401 }),
      ),
    );
    renderWithQuery(
      <Can permission="product:read" fallback={<span>없음</span>}>
        <span>보임</span>
      </Can>,
    );
    expect(await screen.findByText('없음')).toBeInTheDocument();
    expect(screen.queryByText('보임')).not.toBeInTheDocument();
  });
});
