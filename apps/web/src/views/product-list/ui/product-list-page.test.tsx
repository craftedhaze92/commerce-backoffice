import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Role } from '@bo/contracts';
import { sessionKeys } from '@/entities/session';
import { createTestQueryClient, renderWithQuery } from '@/shared/testing/render-with-query';
import { REVOKE_DELAY_MS } from '@/shared/lib/save-blob';
import { server } from '@/shared/testing/msw-server';
import { getMockSearch, navReplace, setMockSearch } from '@/shared/testing/mock-navigation';
import { productDetailFixture } from '@/shared/api/mocks/products';
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

  it('manager opens the 상품 등록 modal from the list without leaving the page', async () => {
    renderWithQuery(<ProductListPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '상품 등록' }));
    expect(await screen.findByRole('dialog', { name: '상품 등록' })).toBeInTheDocument();
    expect(navReplace).not.toHaveBeenCalled();
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

  it('?detail=<id> opens the detail modal over the list; 닫기 drops only detail and keeps filters', async () => {
    setMockSearch(`q=테스트&page=2&detail=${productDetailFixture.id}`);
    renderWithQuery(<ProductListPage />);
    const dialog = await screen.findByRole('dialog', { name: productDetailFixture.name });
    expect(within(dialog).getByLabelText('상품명')).toHaveValue(productDetailFixture.name);
    await userEvent.setup().click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(Object.fromEntries(new URLSearchParams(getMockSearch()))).toEqual({
      q: '테스트',
      page: '2',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('product name links add detail to the current query instead of leaving the list', async () => {
    setMockSearch('status=ON_SALE');
    renderWithQuery(<ProductListPage />);
    const link = await screen.findByRole('link', { name: '테스트 상품 1' });
    const href = new URL(link.getAttribute('href')!, 'http://x');
    expect(href.pathname).toBe('/products');
    expect(href.searchParams.get('status')).toBe('ON_SALE');
    expect(href.searchParams.get('detail')).toBeTruthy();
  });

  it('viewer does not see 상품 등록', async () => {
    useRole(Role.VIEWER);
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    expect(screen.queryByRole('button', { name: '상품 등록' })).not.toBeInTheDocument();
  });

  it('typing alone does not search; Enter submits q once and resets page', async () => {
    setMockSearch('page=2');
    const seen: string[] = [];
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        seen.push(new URL(request.url).search);
        return undefined;
      }),
    );
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 21');
    const user = userEvent.setup();
    const input = screen.getByRole('searchbox', { name: '상품 검색' });
    await user.type(input, '상품 3');
    // 디바운스 시간이 지나도 입력만으로는 요청하지 않는다
    await new Promise((r) => setTimeout(r, 400));
    expect(navReplace).not.toHaveBeenCalled();
    expect(seen.some((q) => q.includes('q='))).toBe(false);
    await user.keyboard('{Enter}');
    expect(navReplace).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(getMockSearch()).get('q')).toBe('상품 3');
    expect(getMockSearch()).not.toContain('page=');
    expect(input).toHaveValue('상품 3');
    await waitFor(() =>
      expect(seen.some((q) => new URLSearchParams(q).get('q') === '상품 3')).toBe(true),
    );
  });

  it('검색 button submits the trimmed query', async () => {
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: '상품 검색' }), '  상품 3  ');
    await user.click(screen.getByRole('button', { name: '검색' }));
    expect(new URLSearchParams(getMockSearch()).get('q')).toBe('상품 3');
  });

  it('초기화 discards text that was typed but not submitted', async () => {
    renderWithQuery(<ProductListPage />);
    await screen.findByText('테스트 상품 1');
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox', { name: '상품 검색' }), 'a');
    await user.click(screen.getByRole('button', { name: '초기화' }));
    expect(getMockSearch()).toBe('');
    expect(screen.getByRole('searchbox', { name: '상품 검색' })).toHaveValue('');
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
