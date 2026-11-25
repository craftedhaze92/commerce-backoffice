import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp, HttpResponse } from 'msw';
import { productFixtures } from '@/shared/api/mocks/products';
import { server } from '@/shared/testing/msw-server';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { LowStockTable } from './low-stock-table';

describe('LowStockTable', () => {
  it('requests lowStock=true&sort=stock:asc&size=5; shows stock/safetyStock; 전체 보기 → /products?lowStock=true', async () => {
    const seen: string[] = [];
    server.use(
      mswHttp.get('/api/v1/products', ({ request }) => {
        seen.push(new URL(request.url).search);
        return undefined;
      }),
    );
    renderWithQuery(<LowStockTable />);
    const first = productFixtures[0];
    expect(await screen.findByRole('link', { name: first.name })).toHaveAttribute(
      'href',
      `/products/${first.id}`,
    );
    expect(seen).toHaveLength(1);
    const qs = new URLSearchParams(seen[0]);
    expect(qs.get('lowStock')).toBe('true');
    expect(qs.get('sort')).toBe('stock:asc');
    expect(qs.get('size')).toBe('5');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getAllByText(/안전재고 10/)).toHaveLength(5);
    expect(screen.getByText(first.sku)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute(
      'href',
      '/products?lowStock=true',
    );
  });

  it('shows skeleton while loading', () => {
    renderWithQuery(<LowStockTable />);
    expect(screen.getByTestId('low-stock-skeleton')).toBeInTheDocument();
  });

  it('empty → 재고 부족 상품이 없습니다', async () => {
    server.use(
      mswHttp.get('/api/v1/products', () =>
        HttpResponse.json({ items: [], meta: { page: 1, size: 5, total: 0, totalPages: 0 } }),
      ),
    );
    renderWithQuery(<LowStockTable />);
    expect(await screen.findByText('재고 부족 상품이 없습니다')).toBeInTheDocument();
  });

  it('error → 다시 시도 refetches', async () => {
    let fail = true;
    server.use(
      mswHttp.get('/api/v1/products', () =>
        fail
          ? HttpResponse.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'boom' },
              { status: 500 },
            )
          : undefined,
      ),
    );
    renderWithQuery(<LowStockTable />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '재고 부족 상품을 불러오지 못했습니다',
    );
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(5);
  });
});
