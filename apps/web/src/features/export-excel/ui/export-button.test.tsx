import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Role } from '@bo/contracts';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { REVOKE_DELAY_MS } from '@/shared/lib/save-blob';
import { server } from '@/shared/testing/msw-server';
import { ExportButton } from './export-button';

const me = (role: Role) => ({ id: 'u', email: 'u@demo.com', name: 'U', role });
const useRole = (role: Role) =>
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(me(role))));

const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
let clicks: string[];

beforeEach(() => {
  // saveBlob은 object URL을 지연 해제한다. 가짜 타이머로 잡아 두고 테스트가 끝나면 버린다.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this.download);
  });
});

afterEach(() => {
  vi.useRealTimers();
  URL.createObjectURL = original.create;
  URL.revokeObjectURL = original.revoke;
  vi.restoreAllMocks();
});

const tooLarge = (total: number) =>
  HttpResponse.json(
    {
      statusCode: 422,
      code: 'EXPORT_TOO_LARGE',
      message: 'too large',
      details: { total, maxRows: 10_000 },
    },
    { status: 422 },
  );

describe('ExportButton', () => {
  it('manager sees 엑셀 다운로드; viewer does not', async () => {
    useRole(Role.MANAGER);
    const { unmount } = renderWithQuery(<ExportButton resource="orders" query="" />);
    expect(await screen.findByRole('button', { name: '엑셀 다운로드' })).toBeInTheDocument();
    unmount();

    useRole(Role.VIEWER);
    renderWithQuery(<ExportButton resource="orders" query="" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: '엑셀 다운로드' })).not.toBeInTheDocument();
  });

  it('click requests /api/v1/orders/export?status=CONFIRMED and saves as 주문목록_20261121.xlsx', async () => {
    useRole(Role.MANAGER);
    let search = '';
    server.use(
      http.get('/api/v1/orders/export', ({ request }) => {
        search = new URL(request.url).search;
        return undefined;
      }),
    );
    renderWithQuery(<ExportButton resource="orders" query="status=CONFIRMED" />);
    await userEvent.click(await screen.findByRole('button', { name: '엑셀 다운로드' }));
    await waitFor(() => expect(clicks).toEqual(['주문목록_20261121.xlsx']));
    expect(search).toBe('?status=CONFIRMED');
    await vi.advanceTimersByTimeAsync(REVOKE_DELAY_MS);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('falls back to export.xlsx without Content-Disposition', async () => {
    useRole(Role.MANAGER);
    server.use(http.get('/api/v1/products/export', () => new HttpResponse('x')));
    renderWithQuery(<ExportButton resource="products" query="" />);
    await userEvent.click(await screen.findByRole('button', { name: '엑셀 다운로드' }));
    await waitFor(() => expect(clicks).toEqual(['export.xlsx']));
  });

  it('shows 다운로드 중… and is disabled while pending', async () => {
    useRole(Role.MANAGER);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    server.use(
      http.get('/api/v1/orders/export', async () => {
        await gate;
        return new HttpResponse('x');
      }),
    );
    renderWithQuery(<ExportButton resource="orders" query="" />);
    await userEvent.click(await screen.findByRole('button', { name: '엑셀 다운로드' }));
    const pending = await screen.findByRole('button', { name: '다운로드 중…' });
    expect(pending).toBeDisabled();
    release();
    expect(await screen.findByRole('button', { name: '엑셀 다운로드' })).toBeEnabled();
  });

  it('422 shows the too-large alert; next click clears it', async () => {
    useRole(Role.MANAGER);
    let fail = true;
    server.use(
      http.get('/api/v1/orders/export', () => (fail ? tooLarge(10_001) : new HttpResponse('x'))),
    );
    renderWithQuery(<ExportButton resource="orders" query="" />);
    await userEvent.click(await screen.findByRole('button', { name: '엑셀 다운로드' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '10,001건은 한 번에 내려받을 수 없습니다. 10,000건 이하가 되도록 필터를 좁혀 주세요.',
    );
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: '엑셀 다운로드' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(clicks).toHaveLength(1));
  });

  it('500 shows generic failure message', async () => {
    useRole(Role.MANAGER);
    server.use(
      http.get('/api/v1/orders/export', () =>
        HttpResponse.json({ statusCode: 500, code: 'INTERNAL', message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithQuery(<ExportButton resource="orders" query="" />);
    await userEvent.click(await screen.findByRole('button', { name: '엑셀 다운로드' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '다운로드에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(clicks).toEqual([]);
  });
});
