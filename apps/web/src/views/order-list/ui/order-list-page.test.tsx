import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { OrderStatus, Role, type OrderListItem } from '@bo/contracts';
import { sessionKeys } from '@/entities/session';
import { createTestQueryClient, renderWithQuery } from '@/shared/testing/render-with-query';
import { REVOKE_DELAY_MS } from '@/shared/lib/save-blob';
import { server } from '@/shared/testing/msw-server';
import { getMockSearch, navReplace, setMockSearch } from '@/shared/testing/mock-navigation';
import { orderFixtures, seedOrderMock } from '@/shared/api/mocks/orders';
import { kstPreset, kstToday } from '@/shared/lib/date-range';
import { OrderListPage } from './order-list-page';

vi.mock('next/navigation', async () => {
  const m = await import('@/shared/testing/mock-navigation');
  return m.navigationMock;
});

const me = (role: Role) => ({ id: 'u', email: 'u@demo.com', name: 'U', role });

function useRole(role: Role) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(me(role))));
}

/** 주문 목록 요청의 쿼리 문자열을 기록한다. 기본 핸들러로 응답한다. */
function recordOrderRequests(): string[] {
  const seen: string[] = [];
  server.use(
    http.get('/api/v1/orders', ({ request }) => {
      seen.push(new URL(request.url).search);
      return undefined;
    }),
  );
  return seen;
}

/** 엑셀 내려받기 요청의 쿼리 문자열을 기록한다. */
function recordExportRequests(resource: 'orders'): string[] {
  const seen: string[] = [];
  server.use(
    http.get(`/api/v1/${resource}/export`, ({ request }) => {
      seen.push(new URL(request.url).search);
      return undefined;
    }),
  );
  return seen;
}

/** jsdom에는 Blob URL과 앵커 다운로드가 없어 가로챈다. */
function stubDownload() {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return { revoke, click };
}

beforeAll(() => {
  // jsdom에는 Radix Select가 쓰는 포인터 캡처·scrollIntoView가 없다
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

/** 열린 달력의 날짜 버튼을 `YYYY-MM-DD`와 함께 돌려준다(data-day는 ko 로캘 표기 "2026. 11. 26."). */
function calendarDays(): { date: string; button: HTMLElement }[] {
  return within(screen.getByRole('grid'))
    .getAllByRole('button')
    .flatMap((button) => {
      const m = /(\d+)\.\s*(\d+)\.\s*(\d+)/.exec(button.getAttribute('data-day') ?? '');
      if (!m) return [];
      const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      return [{ date, button }];
    });
}

function dayButton(date: string): HTMLElement {
  const found = calendarDays().find((d) => d.date === date);
  if (!found) throw new Error(`calendar has no day ${date}`);
  return found.button;
}

describe('OrderListPage', () => {
  beforeEach(() => {
    setMockSearch('');
    useRole(Role.MANAGER);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('shows title and total once loaded', async () => {
    renderWithQuery(<OrderListPage />);
    expect(screen.getByRole('heading', { name: '주문' })).toBeInTheDocument();
    expect(await screen.findByText('총 30건')).toBeInTheDocument();
    expect(await screen.findByText(orderFixtures[29].orderNo)).toBeInTheDocument();
  });

  it('tampered URL renders and requests /api/v1/orders with defaults', async () => {
    setMockSearch('status=X&from=2026-13-01&to=abc&page=-1&sort=password:asc');
    const seen = recordOrderRequests();
    renderWithQuery(<OrderListPage />);
    expect(await screen.findByText('총 30건')).toBeInTheDocument();
    expect(seen).toEqual(['']);
  });

  it('clicking 확정 tab writes ?status=CONFIRMED and resets page', async () => {
    setMockSearch('page=2');
    const seen = recordOrderRequests();
    renderWithQuery(<OrderListPage />);
    await screen.findByText('총 30건');
    const user = userEvent.setup();
    expect(screen.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: '확정' }));
    expect(getMockSearch()).toBe('status=CONFIRMED');
    expect(screen.getByRole('tab', { name: '확정' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(seen).toContain('?status=CONFIRMED'));
  });

  it('tab 전체 clears status', async () => {
    setMockSearch('status=CANCELLED&q=a');
    renderWithQuery(<OrderListPage />);
    await screen.findByText(/^총 /);
    await userEvent.setup().click(screen.getByRole('tab', { name: '전체' }));
    expect(getMockSearch()).toBe('q=a');
  });

  it('preset 최근 7일 writes from/to and highlights; 전체 clears them', async () => {
    renderWithQuery(<OrderListPage />);
    await screen.findByText('총 30건');
    const user = userEvent.setup();
    const { from, to } = kstPreset('7d');
    await user.click(screen.getByRole('button', { name: '최근 7일' }));
    expect(new URLSearchParams(getMockSearch()).get('from')).toBe(from);
    expect(new URLSearchParams(getMockSearch()).get('to')).toBe(to);
    expect(screen.getByRole('button', { name: '최근 7일' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '오늘' })).toHaveAttribute('aria-pressed', 'false');
    expect(
      screen.getByRole('button', { name: `시작일 ${from.replaceAll('-', '.')}` }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '전체' }));
    expect(getMockSearch()).toBe('');
    expect(screen.getByRole('button', { name: '시작일' })).toBeInTheDocument();
  });

  it('picking a day in the 종료일 calendar commits it to the URL and closes the calendar', async () => {
    renderWithQuery(<OrderListPage />);
    await screen.findByText('총 30건');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '종료일' }));
    const today = kstToday();
    await user.click(dayButton(today));
    expect(getMockSearch()).toBe(`to=${today}`);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `종료일 ${today.replaceAll('-', '.')}` }),
    ).toBeInTheDocument();
  });

  it('days after today (KST) cannot be picked in either calendar', async () => {
    renderWithQuery(<OrderListPage />);
    await screen.findByText('총 30건');
    const user = userEvent.setup();
    const today = kstToday();
    for (const name of ['시작일', '종료일']) {
      await user.click(screen.getByRole('button', { name }));
      const days = calendarDays();
      expect(days.some((d) => d.date > today)).toBe(true);
      for (const d of days) {
        if (d.date > today) expect(d.button).toBeDisabled();
      }
      expect(dayButton(today)).toBeEnabled();
      await user.keyboard('{Escape}');
    }
  });

  it('시작일 calendar disables days after the chosen 종료일 so start > end cannot be picked', async () => {
    setMockSearch('to=2026-11-10');
    renderWithQuery(<OrderListPage />);
    await screen.findByText(/^총 /);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '시작일' }));
    expect(dayButton('2026-11-20')).toBeDisabled();
    await user.click(dayButton('2026-11-01'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(Object.fromEntries(new URLSearchParams(getMockSearch()))).toEqual({
      from: '2026-11-01',
      to: '2026-11-10',
    });
  });

  it('search debounce writes q once after 300ms', async () => {
    setMockSearch('page=2');
    renderWithQuery(<OrderListPage />);
    await screen.findByText(/^총 /);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(screen.getByRole('searchbox', { name: '주문 검색' }), '고객 3');
      expect(navReplace).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(navReplace).toHaveBeenCalledTimes(1);
      expect(new URLSearchParams(getMockSearch()).get('q')).toBe('고객 3');
      expect(getMockSearch()).not.toContain('page=');
    } finally {
      vi.useRealTimers();
    }
  });

  it('초기화 cancels a pending search debounce', async () => {
    renderWithQuery(<OrderListPage />);
    await screen.findByText(/^총 /);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(screen.getByRole('searchbox', { name: '주문 검색' }), 'a');
      await user.click(screen.getByRole('button', { name: '초기화' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(getMockSearch()).toBe('');
      expect(screen.getByRole('searchbox', { name: '주문 검색' })).toHaveValue('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('?to=2026-11-20 includes 23:59 KST and excludes 00:00 KST of the next day', async () => {
    const mk = (n: number, createdAt: string): OrderListItem => ({
      ...orderFixtures[0],
      id: `00000000-0000-4000-8000-b0000000000${n}`,
      orderNo: `ORD-KST-${n}`,
      customerName: `경계 고객 ${n}`,
      status: OrderStatus.PENDING,
      createdAt,
    });
    seedOrderMock(mk(1, '2026-11-20T14:59:00.000Z')); // 11-20 23:59 KST
    seedOrderMock(mk(2, '2026-11-20T15:00:00.000Z')); // 11-21 00:00 KST
    setMockSearch('to=2026-11-20&q=ORD-KST');
    renderWithQuery(<OrderListPage />);
    expect(await screen.findByText('ORD-KST-1')).toBeInTheDocument();
    expect(await screen.findByText('총 1건')).toBeInTheDocument();
    expect(screen.queryByText('ORD-KST-2')).not.toBeInTheDocument();
  });

  it('with ?status=CONFIRMED&from=2026-11-01&to=2026-11-20, 엑셀 다운로드 requests /api/v1/orders/export with the same filters', async () => {
    // saveBlob은 object URL을 지연 해제한다. 가짜 타이머로 그 타이머까지 끝내고 나온다.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { revoke, click } = stubDownload();
      setMockSearch('status=CONFIRMED&from=2026-11-01&to=2026-11-20');
      const listed = recordOrderRequests();
      const exported = recordExportRequests('orders');
      renderWithQuery(<OrderListPage />);
      await userEvent.click(await screen.findByRole('button', { name: '엑셀 다운로드' }));
      await waitFor(() => expect(exported).toHaveLength(1));
      expect(listed[0]).toBe('?status=CONFIRMED&from=2026-11-01&to=2026-11-20');
      expect(exported[0]).toBe(listed[0]);
      await waitFor(() => expect(click).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(REVOKE_DELAY_MS);
      expect(revoke).toHaveBeenCalledWith('blob:mock');
    } finally {
      vi.useRealTimers();
    }
  });

  it('viewer: no 엑셀 다운로드 on either page', async () => {
    useRole(Role.VIEWER);
    const client = createTestQueryClient();
    renderWithQuery(<OrderListPage />, { client });
    await screen.findByText('총 30건');
    await waitFor(() =>
      expect(client.getQueryData(sessionKeys.me)).toMatchObject({ role: Role.VIEWER }),
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByRole('button', { name: '엑셀 다운로드' })).not.toBeInTheDocument();
  });

  describe('GenerateOrdersButton', () => {
    it('manager sees it; click posts count 5, shows status and refreshes the list', async () => {
      let body: unknown;
      server.use(
        http.post('/api/v1/dev/orders/random', async ({ request }) => {
          body = await request.clone().json();
          return undefined;
        }),
      );
      renderWithQuery(<OrderListPage />);
      await screen.findByText('총 30건');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: '가상 주문 5건 생성' }));
      expect(await screen.findByRole('status')).toHaveTextContent('주문 5건을 만들었습니다');
      expect(body).toEqual({ count: 5 });
      expect(await screen.findByText('총 35건')).toBeInTheDocument();
    });

    it('is disabled with 생성 중... while pending', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      server.use(
        http.post('/api/v1/dev/orders/random', async () => {
          await gate;
          return HttpResponse.json({ created: [] }, { status: 201 });
        }),
      );
      renderWithQuery(<OrderListPage />);
      await userEvent
        .setup()
        .click(await screen.findByRole('button', { name: '가상 주문 5건 생성' }));
      expect(await screen.findByRole('button', { name: '생성 중...' })).toBeDisabled();
      release();
      expect(await screen.findByRole('status')).toBeInTheDocument();
    });

    it('shows an alert when generation fails', async () => {
      server.use(
        http.post('/api/v1/dev/orders/random', () =>
          HttpResponse.json({ statusCode: 500, code: 'INTERNAL', message: 'x' }, { status: 500 }),
        ),
      );
      renderWithQuery(<OrderListPage />);
      await userEvent
        .setup()
        .click(await screen.findByRole('button', { name: '가상 주문 5건 생성' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('가상 주문을 만들지 못했습니다');
    });

    it('viewer does not see it', async () => {
      useRole(Role.VIEWER);
      const client = createTestQueryClient();
      renderWithQuery(<OrderListPage />, { client });
      await screen.findByText('총 30건');
      // 세션이 viewer로 확정된 뒤에만 부재를 단언한다
      await waitFor(() =>
        expect(client.getQueryData(sessionKeys.me)).toMatchObject({ role: Role.VIEWER }),
      );
      await waitFor(() => expect(client.isFetching()).toBe(0));
      expect(screen.queryByRole('button', { name: /가상 주문/ })).not.toBeInTheDocument();
    });

    it('is hidden in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const client = createTestQueryClient();
      renderWithQuery(<OrderListPage />, { client });
      await screen.findByText('총 30건');
      // manager 세션이 도착한 뒤에도 production이라 숨겨져야 한다
      await waitFor(() =>
        expect(client.getQueryData(sessionKeys.me)).toMatchObject({ role: Role.MANAGER }),
      );
      await waitFor(() => expect(client.isFetching()).toBe(0));
      expect(screen.queryByRole('button', { name: /가상 주문/ })).not.toBeInTheDocument();
    });
  });
});
