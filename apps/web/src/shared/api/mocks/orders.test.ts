import { describe, expect, it } from 'vitest';
import {
  InventoryChangeReason,
  OrderStatus,
  type InsufficientStockItem,
  type InventoryHistoryItem,
  type OrderDetail,
  type OrderListItem,
  type Paginated,
  type ProductDetail,
} from '@bo/contracts';
import { http } from '@/shared/api';
import { orderDetailFixture, orderFixtures, SHORT_STOCK_ORDER_ID } from './orders';
import { productFixtures } from './products';

const post = <T>(path: string, body?: unknown) => http<T>(path, { method: 'POST', json: body });

describe('orderHandlers', () => {
  it('has 30 deterministic fixtures with mixed statuses', () => {
    expect(orderFixtures).toHaveLength(30);
    expect(new Set(orderFixtures.map((o) => o.status))).toEqual(
      new Set(Object.values(OrderStatus)),
    );
  });

  it('paginates and filters by status and q', async () => {
    const p = await http<Paginated<OrderListItem>>('/orders?page=2&size=10');
    expect(p.items).toHaveLength(10);
    expect(p.meta).toEqual({ page: 2, size: 10, total: 30, totalPages: 3 });
    const s = await http<Paginated<OrderListItem>>('/orders?status=CANCELLED');
    expect(s.items.length).toBeGreaterThan(0);
    expect(s.items.every((o) => o.status === OrderStatus.CANCELLED)).toBe(true);
    const q = await http<Paginated<OrderListItem>>(
      `/orders?q=${encodeURIComponent(orderFixtures[0].orderNo)}`,
    );
    expect(q.items.map((o) => o.id)).toEqual([orderFixtures[0].id]);
  });

  it('applies the state machine and 409s on invalid transitions', async () => {
    const id = orderDetailFixture.id;
    const confirmed = await post<OrderDetail>(`/orders/${id}/confirm`);
    expect(confirmed.status).toBe(OrderStatus.CONFIRMED);
    expect(confirmed.history.at(-1)?.toStatus).toBe(OrderStatus.CONFIRMED);
    await expect(post(`/orders/${id}/deliver`)).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      details: { from: OrderStatus.CONFIRMED, to: OrderStatus.DELIVERED },
    });
    const detail = await http<OrderDetail>(`/orders/${id}`);
    expect(detail.status).toBe(OrderStatus.CONFIRMED);
  });

  it('state is reset between tests', async () => {
    const detail = await http<OrderDetail>(`/orders/${orderDetailFixture.id}`);
    expect(detail.status).toBe(OrderStatus.PENDING);
  });

  it('422s INSUFFICIENT_STOCK for the short-stock order', async () => {
    await expect(post(`/orders/${SHORT_STOCK_ORDER_ID}/confirm`)).rejects.toMatchObject({
      status: 422,
      code: 'INSUFFICIENT_STOCK',
    });
    const list = await http<Paginated<OrderListItem>>('/orders?size=100');
    expect(list.items.find((o) => o.id === SHORT_STOCK_ORDER_ID)?.status).toBe(OrderStatus.PENDING);
  });

  it('creates random orders in dev', async () => {
    const res = await post<{ created: OrderListItem[] }>('/dev/orders/random', { count: 3 });
    expect(res.created).toHaveLength(3);
    const list = await http<Paginated<OrderListItem>>('/orders');
    expect(list.meta.total).toBe(33);
  });

  it('shortage details are typed items', async () => {
    const err = await post(`/orders/${SHORT_STOCK_ORDER_ID}/confirm`).catch((e: unknown) => e);
    const details = (err as { details: InsufficientStockItem[] }).details;
    expect(details[0]).toMatchObject({
      requested: expect.any(Number),
      available: expect.any(Number),
    });
  });
});

describe('inventory handlers', () => {
  const id = productFixtures[0].id;

  it('lists history with order and manual rows', async () => {
    const res = await http<Paginated<InventoryHistoryItem>>(`/products/${id}/inventory-history`);
    const reasons = res.items.map((i) => i.reason);
    expect(reasons).toContain(InventoryChangeReason.ORDER_CONFIRM);
    expect(reasons).toContain(InventoryChangeReason.MANUAL_ADJUST);
    expect(res.items.find((i) => i.reason === InventoryChangeReason.ORDER_CONFIRM)).toMatchObject({
      refOrderId: expect.any(String),
      refOrderNo: expect.any(String),
    });
    expect(res.items.find((i) => i.reason === InventoryChangeReason.MANUAL_ADJUST)?.note).toEqual(
      expect.any(String),
    );
  });

  it('adjusts stock and rejects negative results', async () => {
    const res = await http<ProductDetail>(`/products/${id}/inventory`, {
      method: 'PATCH',
      json: { delta: 5, note: '입고' },
    });
    expect(res.stock).toBe(productFixtures[0].stock + 5);
    await expect(
      http(`/products/${id}/inventory`, {
        method: 'PATCH',
        json: { delta: -100000, note: '과다' },
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
});
