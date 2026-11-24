import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { OrderStatus, Role, type OrderDetail } from '@bo/contracts';
import { createTestQueryClient, renderWithQuery } from '@/shared/testing/render-with-query';
import { server } from '@/shared/testing/msw-server';
import { SHORT_STOCK_ORDER_ID, orderDetailFixture, orderFixtures } from '@/shared/api/mocks/orders';
import { sessionKeys } from '@/entities/session';
import { productFixtures } from '@/shared/api/mocks/products';
import { OrderDetailPage } from './order-detail-page';

vi.mock('next/navigation', async () => {
  const m = await import('@/shared/testing/mock-navigation');
  return m.navigationMock;
});

const me = (role: Role) => ({ id: 'u', email: 'u@demo.com', name: 'U', role });
function useRole(role: Role) {
  server.use(http.get('/api/v1/auth/me', () => HttpResponse.json(me(role))));
}

const ID = orderDetailFixture.id;

describe('OrderDetailPage', () => {
  beforeEach(() => useRole(Role.MANAGER));

  it('manager sees the action buttons once the session is loaded (positive control)', async () => {
    const client = createTestQueryClient();
    renderWithQuery(<OrderDetailPage id={ID} />, { client });
    await screen.findByText('합계');
    await waitFor(() =>
      expect(client.getQueryData(sessionKeys.me)).toMatchObject({ role: 'MANAGER' }),
    );
    expect(await screen.findByRole('button', { name: '확정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '주문 취소' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '출고 처리' })).not.toBeInTheDocument();
  });

  it('viewer sees no action buttons after the session has loaded', async () => {
    useRole(Role.VIEWER);
    const client = createTestQueryClient();
    renderWithQuery(<OrderDetailPage id={ID} />, { client });
    await screen.findByRole('heading', { name: orderDetailFixture.orderNo });
    await screen.findByText('합계');
    // 세션이 도착해 viewer로 확정된 뒤에만 부재를 단언한다
    await waitFor(() =>
      expect(client.getQueryData(sessionKeys.me)).toMatchObject({ role: 'VIEWER' }),
    );
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByRole('button', { name: '확정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '주문 취소' })).not.toBeInTheDocument();
  });

  it('confirm success updates badge to 확정 and timeline gains an entry', async () => {
    const user = userEvent.setup();
    renderWithQuery(<OrderDetailPage id={ID} />);
    const timeline = await screen.findByRole('list', { name: '상태 이력' });
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(1);
    expect(within(timeline).getByText('시스템')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '확정' }));

    await waitFor(() => expect(within(timeline).getAllByRole('listitem')).toHaveLength(2));
    const items = within(timeline).getAllByRole('listitem');
    expect(within(items[1]).getByText('확정')).toBeInTheDocument();
    expect(within(items[1]).getByText('관리자')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '출고 처리' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '확정' })).not.toBeInTheDocument();
  });

  it('shows the timeline oldest first with KST time', async () => {
    const detail: OrderDetail = {
      ...orderDetailFixture,
      status: OrderStatus.CONFIRMED,
      history: [
        {
          id: 'h2',
          fromStatus: OrderStatus.PENDING,
          toStatus: OrderStatus.CONFIRMED,
          actorName: '관리자',
          createdAt: '2026-01-02T00:30:00.000Z',
        },
        {
          id: 'h1',
          fromStatus: null,
          toStatus: OrderStatus.PENDING,
          actorName: null,
          createdAt: '2026-01-01T15:30:00.000Z',
        },
      ],
    };
    server.use(http.get(`/api/v1/orders/${ID}`, () => HttpResponse.json(detail)));
    renderWithQuery(<OrderDetailPage id={ID} />);
    const items = within(await screen.findByRole('list', { name: '상태 이력' })).getAllByRole(
      'listitem',
    );
    expect(items[0]).toHaveTextContent('접수2026.01.02 00:30시스템');
    expect(items[1]).toHaveTextContent('확정2026.01.02 09:30관리자');
  });

  it('422 renders per-item shortage list', async () => {
    const user = userEvent.setup();
    renderWithQuery(<OrderDetailPage id={SHORT_STOCK_ORDER_ID} />);
    await user.click(await screen.findByRole('button', { name: '확정' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('재고가 부족해 확정할 수 없습니다');
    const p1 = productFixtures[0];
    expect(within(alert).getByRole('listitem')).toHaveTextContent(
      `${p1.name}(${p1.sku}): 필요 5개 / 재고 2개`,
    );
    expect(screen.getByRole('button', { name: '확정' })).toBeEnabled();
  });

  it('409 shows conflict message and refetches detail', async () => {
    let gets = 0;
    server.use(
      http.get(`/api/v1/orders/${ID}`, () => {
        gets += 1;
        return HttpResponse.json(orderDetailFixture);
      }),
      http.post(`/api/v1/orders/${ID}/confirm`, () =>
        HttpResponse.json(
          { statusCode: 409, code: 'CONFLICT', message: 'x', details: {} },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<OrderDetailPage id={ID} />);
    await user.click(await screen.findByRole('button', { name: '확정' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '다른 사용자가 먼저 상태를 바꿨습니다',
    );
    await waitFor(() => expect(gets).toBe(2));
  });

  it('409 keeps the conflict message even when the refetched order is terminal', async () => {
    const cancelled: OrderDetail = { ...orderDetailFixture, status: OrderStatus.CANCELLED };
    let gets = 0;
    server.use(
      http.get(`/api/v1/orders/${ID}`, () => {
        gets += 1;
        return HttpResponse.json(gets === 1 ? orderDetailFixture : cancelled);
      }),
      http.post(`/api/v1/orders/${ID}/confirm`, () =>
        HttpResponse.json(
          { statusCode: 409, code: 'CONFLICT', message: 'x', details: {} },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<OrderDetailPage id={ID} />);
    await user.click(await screen.findByRole('button', { name: '확정' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '확정' })).not.toBeInTheDocument(),
    );
    expect(gets).toBe(2);
    expect(screen.getByRole('alert')).toHaveTextContent('다른 사용자가 먼저 상태를 바꿨습니다');
  });

  it('other errors show a generic message', async () => {
    server.use(
      http.post(`/api/v1/orders/${ID}/confirm`, () =>
        HttpResponse.json({ statusCode: 500, code: 'INTERNAL', message: 'x' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<OrderDetailPage id={ID} />);
    await user.click(await screen.findByRole('button', { name: '확정' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('상태를 바꾸지 못했습니다');
  });

  it('cancel of a CONFIRMED order asks confirmation mentioning 재고 복원', async () => {
    const user = userEvent.setup();
    renderWithQuery(<OrderDetailPage id={orderFixtures[1].id} />);
    await user.click(await screen.findByRole('button', { name: '주문 취소' }));
    const dialog = await screen.findByRole('alertdialog', { name: '주문을 취소할까요?' });
    expect(dialog).toHaveTextContent('확정된 주문이라 재고가 되돌아갑니다.');
    await user.click(within(dialog).getByRole('button', { name: '주문 취소' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getAllByText('취소')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: '주문 취소' })).not.toBeInTheDocument();
  });

  it('cancel of a PENDING order has no restock wording', async () => {
    const user = userEvent.setup();
    renderWithQuery(<OrderDetailPage id={ID} />);
    await user.click(await screen.findByRole('button', { name: '주문 취소' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).not.toHaveTextContent('재고');
  });

  it('buttons disabled while mutation pending (double click sends one request)', async () => {
    let posts = 0;
    server.use(
      http.post(`/api/v1/orders/${ID}/confirm`, async () => {
        posts += 1;
        await delay(100);
        return undefined;
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<OrderDetailPage id={ID} />);
    const confirm = await screen.findByRole('button', { name: '확정' });
    await user.dblClick(confirm);
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: '주문 취소' })).toBeDisabled();
    await screen.findByRole('button', { name: '출고 처리' });
    expect(posts).toBe(1);
  });

  it('404 not-found state', async () => {
    renderWithQuery(<OrderDetailPage id="00000000-0000-4000-8000-ffffffffffff" />);
    expect(await screen.findByText('주문을 찾을 수 없습니다')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '목록으로' })).toHaveAttribute('href', '/orders');
  });

  it('other load error offers retry', async () => {
    server.use(
      http.get(`/api/v1/orders/${ID}`, () =>
        HttpResponse.json({ statusCode: 500, code: 'INTERNAL', message: 'x' }, { status: 500 }),
      ),
    );
    renderWithQuery(<OrderDetailPage id={ID} />);
    expect(await screen.findByText('주문을 불러오지 못했습니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument();
  });

  it('items table links products and totals = sum of subtotals', async () => {
    renderWithQuery(<OrderDetailPage id={ID} />);
    const link = await screen.findByRole('link', { name: orderDetailFixture.items[0].productName });
    expect(link).toHaveAttribute('href', `/products/${orderDetailFixture.items[0].productId}`);
    const sum = orderDetailFixture.items.reduce((s, i) => s + i.subtotal, 0);
    expect(sum).toBe(orderDetailFixture.totalAmount);
    const totalRow = screen.getByRole('row', { name: /합계/ });
    expect(totalRow).toHaveTextContent(`₩${sum.toLocaleString('ko-KR')}`);
  });
});
