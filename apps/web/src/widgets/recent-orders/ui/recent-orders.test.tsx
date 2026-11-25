import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp, HttpResponse } from 'msw';
import { orderFixtures } from '@/shared/api/mocks/orders';
import { formatWon } from '@/shared/lib/format-won';
import { server } from '@/shared/testing/msw-server';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { RecentOrders } from './recent-orders';

describe('RecentOrders', () => {
  it('requests /api/v1/orders?size=5 and renders 5 rows linking to detail', async () => {
    const seen: string[] = [];
    server.use(
      mswHttp.get('/api/v1/orders', ({ request }) => {
        seen.push(new URL(request.url).search);
        return undefined;
      }),
    );
    renderWithQuery(<RecentOrders />);
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(5);
    const first = orderFixtures.find((o) =>
      within(items[0]).queryByRole('link', { name: o.orderNo }),
    )!;
    expect(first).toBeDefined();
    expect(within(items[0]).getByRole('link', { name: first.orderNo })).toHaveAttribute(
      'href',
      `/orders/${first.id}`,
    );
    expect(seen).toEqual(['?size=5']);
    const row = within(items[0]);
    expect(row.getByText(new RegExp(first.customerName))).toBeInTheDocument();
    expect(row.getByText(formatWon(first.totalAmount))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/orders');
  });

  it('shows skeleton while loading', () => {
    renderWithQuery(<RecentOrders />);
    expect(screen.getByTestId('recent-orders-skeleton')).toBeInTheDocument();
  });

  it('empty → 주문이 없습니다', async () => {
    server.use(
      mswHttp.get('/api/v1/orders', () =>
        HttpResponse.json({
          items: [],
          meta: { page: 1, size: 5, total: 0, totalPages: 0 },
        }),
      ),
    );
    renderWithQuery(<RecentOrders />);
    expect(await screen.findByText('주문이 없습니다')).toBeInTheDocument();
  });

  it('error → 다시 시도 refetches', async () => {
    let fail = true;
    server.use(
      mswHttp.get('/api/v1/orders', () =>
        fail
          ? HttpResponse.json(
              { statusCode: 500, code: 'INTERNAL_ERROR', message: 'boom' },
              { status: 500 },
            )
          : undefined,
      ),
    );
    renderWithQuery(<RecentOrders />);
    expect(await screen.findByRole('alert')).toHaveTextContent('최근 주문을 불러오지 못했습니다');
    fail = false;
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
