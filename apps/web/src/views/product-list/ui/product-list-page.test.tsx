import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Role } from '@bo/contracts';
import { sessionKeys } from '@/entities/session';
import { createTestQueryClient, renderWithQuery } from '@/shared/testing/render-with-query';
import { REVOKE_DELAY_MS } from '@/shared/lib/save-blob';
import { server } from '@/shared/testing/msw-server';
import { getMockSearch, navReplace, setMockSearch } from '@/shared/testing/mock-navigation';
import { ProductListPage } from './product-list-page';

vi.mock('next/navigation', async () => {
  const m = await import('@/shared/testing/mock-navigation');
  return m.navigationMock;
});

const me = (role: Role) => ({ id: 'u', email: 'u@demo.com', name: 'U', role });

function useRole(role: Role) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(me(role))));
}

/** 상품 목록 요청의 쿼리 문자열을 기록한다. 기본 핸들러로 응답한다. */
function recordProductRequests(): string[] {
  const seen: string[] = [];
  server.use(
    http.get('/api/v1/products', ({ request }) => {
      seen.push(new URL(request.url).search);
      return undefined;
    }),
  );
  return seen;
}

/** 엑셀 내려받기 요청의 쿼리 문자열을 기록한다. */
function recordExportRequests(resource: 'products'): string[] {
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

describe('ProductListPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    setMockSearch('');
    useRole(Role.MANAGER);
  });

  it('shows title and total once loaded', async () => {
    renderWithQuery(<ProductListPage />);
    expect(screen.getByRole('heading', { name: '상품' })).toBeInTheDocument();
    expect(screen.queryByText(/^총 /)).not.toBeInTheDocument();
    expect(await screen.findByText('총 25개')).toBeInTheDocument();
    expect(await screen.findByText('테스트 상품 1')).toBeInTheDocument();
  });

  it('survives a tampered URL and requests defaults', async () => {
    setMockSearch('page=abc&sort=password:asc&status=FOO&minPrice=-1');
    const seen = recordProductRequests();
    renderWithQuery(<ProductListPage />);
    expect(await screen.findByText('테스트 상품 1')).toBeInTheDocument();
    expect(seen).toEqual(['']);
  });

  it('manager sees 상품 등록 linking to /products/new', async () => {
    renderWithQuery(<ProductListPage />);
    const link = await screen.findByRole('link', { name: '상품 등록' });
    expect(link).toHaveAttribute('href', '/products/new');
  });

  it('with ?q=크림&lowStock=true&sort=price:asc, 엑셀 다운로드 requests /api/v1/products/export with the same filters', async () => {
    // saveBlob은 object URL을 지연 해제한다. 가짜 타이머로 그 타이머까지 끝내고 나온다.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { revoke, click } = stubDownload();
      setMockSearch('q=크림&lowStock=true&sort=price:asc');
      const listed = recordProductRequests();
      const exported = recordExportRequests('products');
      renderWithQuery(<ProductListPage />);
      await userEvent.click(await screen.findByRole('button', { name: '엑셀 다운로드' }));
      await waitFor(() => expect(exported).toHaveLength(1));
      expect(listed[0]).not.toBe('');
      expect(exported[0]).toBe(listed[0]);
      await waitFor(() => expect(click).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(REVOKE_DELAY_MS);
      expect(revoke).toHaveBeenCalledWith('blob:mock');
    } finally {
      vi.useRealTimers();
    }
  });

  it('viewer does not see 엑셀 다운로드', async () => {
    useRole(Role.VIEWER);
    const client = createTestQueryClient();
    renderWithQuery(<ProductListPage />, { client });
    await screen.findByText('테스트 상품 1');
    await waitFor(() =>
      expect(client.getQueryData(sessionKeys.me)).toMatchObject({ role: Role.VIEWER }),
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByRole('button', { name: '엑셀 다운로드' })).not.toBeInTheDocument();
  });

  it('viewer does not see 상품 등록', async () => {
    useRole(Role.VIEWER);
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    expect(screen.queryByRole('link', { name: '상품 등록' })).not.toBeInTheDocument();
  });

  it('typing in search updates URL once after 300ms with page reset', async () => {
    setMockSearch('page=2');
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 21');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const input = screen.getByRole('searchbox', { name: '상품 검색' });
      await user.type(input, '상품 3');
      expect(input).toHaveValue('상품 3');
      expect(navReplace).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(navReplace).toHaveBeenCalledTimes(1);
      expect(new URLSearchParams(getMockSearch()).get('q')).toBe('상품 3');
      expect(getMockSearch()).not.toContain('page=');
      expect(input).toHaveValue('상품 3');
    } finally {
      vi.useRealTimers();
    }
  });

  it('초기화 cancels a pending search debounce even when URL q is empty', async () => {
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(screen.getByRole('searchbox', { name: '상품 검색' }), 'a');
      await user.click(screen.getByRole('button', { name: '초기화' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(getMockSearch()).toBe('');
      expect(screen.getByRole('searchbox', { name: '상품 검색' })).toHaveValue('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('selecting status writes ?status=ON_SALE and requests it', async () => {
    const seen = recordProductRequests();
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: '상태' }));
    await user.click(await screen.findByRole('option', { name: '판매중' }));
    expect(getMockSearch()).toBe('status=ON_SALE');
    await waitFor(() => expect(seen).toContain('?status=ON_SALE'));
  });

  it('선택 후 "전체" clears the key', async () => {
    setMockSearch('status=ON_SALE&q=a');
    renderWithQuery(<ProductListPage />);
    await screen.findByText(/^총 /);
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: '상태' }));
    await user.click(await screen.findByRole('option', { name: '전체' }));
    expect(getMockSearch()).toBe('q=a');
  });

  it('min > max shows inline error and does not change URL', async () => {
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: '최대 가격' }), '1000');
    await user.tab();
    expect(getMockSearch()).toBe('maxPrice=1000');
    navReplace.mockClear();
    await user.type(screen.getByRole('textbox', { name: '최소 가격' }), '5000{Enter}');
    expect(screen.getByText('최소 가격이 최대 가격보다 클 수 없습니다')).toBeInTheDocument();
    expect(navReplace).not.toHaveBeenCalled();
    expect(getMockSearch()).toBe('maxPrice=1000');
  });

  it('commits price on Enter', async () => {
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: '최소 가격' }), '2000{Enter}');
    expect(getMockSearch()).toBe('minPrice=2000');
  });

  it('page 2 via pagination writes ?page=2 and keeps filters', async () => {
    setMockSearch('q=상품');
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(new URLSearchParams(getMockSearch()).get('page')).toBe('2');
    expect(new URLSearchParams(getMockSearch()).get('q')).toBe('상품');
  });

  it('page size select writes size and resets page', async () => {
    setMockSearch('page=2');
    renderWithQuery(<ProductListPage />);
    await screen.findByText(/^총 /);
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: '페이지 크기' }));
    await user.click(await screen.findByRole('option', { name: '50개씩' }));
    expect(getMockSearch()).toBe('size=50');
  });

  it('lowStock toggle and 초기화', async () => {
    setMockSearch('q=abc&status=DRAFT');
    renderWithQuery(<ProductListPage />);
    await screen.findByText(/^총 /);
    const user = userEvent.setup();
    expect(screen.getByRole('searchbox', { name: '상품 검색' })).toHaveValue('abc');
    await user.click(screen.getByRole('button', { name: '재고 부족만' }));
    expect(new URLSearchParams(getMockSearch()).get('lowStock')).toBe('true');
    await user.click(screen.getByRole('button', { name: '초기화' }));
    expect(getMockSearch()).toBe('');
    expect(screen.getByRole('searchbox', { name: '상품 검색' })).toHaveValue('');
  });
});
