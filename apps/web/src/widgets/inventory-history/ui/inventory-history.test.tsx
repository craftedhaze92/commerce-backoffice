import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { productDetailFixture } from '@/shared/api/mocks/products';
import { orderFixtures } from '@/shared/api/mocks/orders';
import { renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { InventoryHistory } from './inventory-history';

const ID = productDetailFixture.id;

describe('InventoryHistory', () => {
  it('renders reason labels, signed deltas, KST time, actor and order link', async () => {
    renderWithQuery(<InventoryHistory productId={ID} />);
    // baseHistory: i=0 ORDER_CONFIRM(-2) → 2026-02-20T00:00Z = 09:00 KST
    const link = await screen.findByRole('link', { name: orderFixtures[0].orderNo });
    expect(link).toHaveAttribute('href', `/orders/${orderFixtures[0].id}`);
    const row = within(link.closest('tr')!);
    expect(row.getByText('주문 확정')).toBeInTheDocument();
    expect(row.getByText('−2')).toHaveClass('text-destructive');
    expect(row.getByText('48')).toBeInTheDocument();
    expect(row.getByText('2026.02.20 09:00')).toBeInTheDocument();
    expect(row.getByText('관리자')).toBeInTheDocument();
    // i=1 ORDER_CANCEL(+2), i=2 MANUAL_ADJUST with note
    expect(screen.getAllByText('주문 취소').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+2')[0]).not.toHaveClass('text-destructive');
    expect(screen.getAllByText('수동 조정').length).toBeGreaterThan(0);
    expect(screen.getAllByText('입고 반영').length).toBeGreaterThan(0);
  });

  it('paginates 10 per page with 이전/다음', async () => {
    const user = userEvent.setup();
    renderWithQuery(<InventoryHistory productId={ID} />);
    await screen.findByRole('link', { name: orderFixtures[0].orderNo });
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText('2 / 2')).toBeInTheDocument();
    await screen.findAllByRole('row');
    expect(screen.queryByRole('link', { name: orderFixtures[0].orderNo })).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  });

  it('shows 시스템 and - when actor and order ref are missing', async () => {
    server.use(
      http.get('/api/v1/products/:id/inventory-history', () =>
        HttpResponse.json({
          items: [
            {
              id: 'x',
              delta: -1,
              quantityAfter: 4,
              reason: 'ORDER_CONFIRM',
              note: null,
              refOrderId: null,
              refOrderNo: null,
              actorName: null,
              createdAt: '2026-02-20T00:00:00.000Z',
            },
          ],
          meta: { page: 1, size: 10, total: 1, totalPages: 1 },
        }),
      ),
    );
    renderWithQuery(<InventoryHistory productId={ID} />);
    const row = within((await screen.findByText('시스템')).closest('tr')!);
    expect(row.getByText('-')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    server.use(
      http.get('/api/v1/products/:id/inventory-history', () =>
        HttpResponse.json({ items: [], meta: { page: 1, size: 10, total: 0, totalPages: 0 } }),
      ),
    );
    renderWithQuery(<InventoryHistory productId={ID} />);
    expect(await screen.findByText('재고 변동 이력이 없습니다')).toBeInTheDocument();
  });

  it('shows aria-busy skeleton while pending', () => {
    renderWithQuery(<InventoryHistory productId={ID} />);
    expect(screen.getAllByTestId('inventory-skeleton-row')[0]).toHaveAttribute('aria-busy', 'true');
  });

  it('shows error with retry that recovers', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get('/api/v1/products/:id/inventory-history', () =>
        fail
          ? HttpResponse.json({ statusCode: 500, code: 'INTERNAL', message: 'x' }, { status: 500 })
          : HttpResponse.json({ items: [], meta: { page: 1, size: 10, total: 0, totalPages: 0 } }),
      ),
    );
    renderWithQuery(<InventoryHistory productId={ID} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('재고 이력을 불러오지 못했습니다');
    fail = false;
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('재고 변동 이력이 없습니다')).toBeInTheDocument();
  });
});
