import {
  InventoryChangeReason,
  OrderStatus,
  nextStatus,
  type ApiErrorBody,
  type InsufficientStockItem,
  type InventoryHistoryItem,
  type OrderAction,
  type OrderDetail,
  type OrderListItem,
  type Paginated,
  type ProductDetail,
} from '@bo/contracts';
import { http, HttpResponse } from 'msw';
import { productDetailFixture, productFixtures } from './products';

const uuid = (n: number, prefix = '0000') =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(8, '0')}`;

const STATUS_CYCLE = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
  OrderStatus.PENDING,
];

/** 30건, 결정적. 상태는 6건 주기로 돈다. 1번째가 PENDING이고 30번째도 PENDING이다. */
export const orderFixtures: OrderListItem[] = Array.from({ length: 30 }, (_, idx) => {
  const n = idx + 1;
  return {
    id: uuid(n, 'o000'),
    orderNo: `ORD-20260101-${String(n).padStart(4, '0')}`,
    customerName: `고객 ${n}`,
    status: STATUS_CYCLE[idx % STATUS_CYCLE.length],
    totalAmount: 30_000 + n * 1_000,
    itemCount: 2,
    createdAt: new Date(Date.UTC(2026, 0, n, 0, 0, 0)).toISOString(),
  };
});

/** 확정하면 422 INSUFFICIENT_STOCK을 돌려주는 PENDING 주문. */
export const SHORT_STOCK_ORDER_ID = orderFixtures[29].id;

const [p1, p2] = productFixtures;

/** 첫 주문(PENDING): 품목 2개, 이력 1개. 합계는 31,000원. */
export const orderDetailFixture: OrderDetail = {
  ...orderFixtures[0],
  confirmedAt: null,
  cancelledAt: null,
  items: [
    {
      id: uuid(1, 'oi00'),
      productId: p1.id,
      sku: p1.sku,
      productName: p1.name,
      quantity: 1,
      unitPrice: 11_000,
      subtotal: 11_000,
    },
    {
      id: uuid(2, 'oi00'),
      productId: p2.id,
      sku: p2.sku,
      productName: p2.name,
      quantity: 2,
      unitPrice: 10_000,
      subtotal: 20_000,
    },
  ],
  history: [
    {
      id: uuid(1, 'oh00'),
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      actorName: null,
      createdAt: orderFixtures[0].createdAt,
    },
  ],
};

function buildDetail(item: OrderListItem): OrderDetail {
  if (item.id === orderDetailFixture.id) return structuredClone(orderDetailFixture);
  const unitPrice = item.totalAmount / 2;
  return {
    ...item,
    confirmedAt: null,
    cancelledAt: null,
    items: [
      {
        id: `${item.id}-i1`,
        productId: p1.id,
        sku: p1.sku,
        productName: p1.name,
        quantity: 2,
        unitPrice,
        subtotal: item.totalAmount,
      },
    ],
    history: [
      {
        id: `${item.id}-h1`,
        fromStatus: null,
        toStatus: OrderStatus.PENDING,
        actorName: null,
        createdAt: item.createdAt,
      },
    ],
  };
}

// ---- 테스트마다 초기화되는 메모리 상태 -------------------------------------

let orders = new Map<string, OrderDetail>();
let stocks = new Map<string, number>();
let histories = new Map<string, InventoryHistoryItem[]>();
let randomSeq = 0;

/** 주문·재고 목 상태를 픽스처로 되돌린다. vitest.setup의 afterEach에서 부른다. */
export function resetOrderMocks(): void {
  orders = new Map(orderFixtures.map((o) => [o.id, buildDetail(o)]));
  stocks = new Map(productFixtures.map((p) => [p.id, p.stock]));
  histories = new Map();
  randomSeq = 0;
}
resetOrderMocks();

/** 테스트가 임의의 주문(예: 날짜 경계)을 목 상태에 넣는다. resetOrderMocks()가 되돌린다. */
export function seedOrderMock(item: OrderListItem): void {
  orders.set(item.id, buildDetail(item));
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 달력 날짜(YYYY-MM-DD)의 00:00 KST를 UTC epoch ms로 돌려준다. API와 같은 경계 의미다. */
function kstDayStart(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS;
}

function toListItem(d: OrderDetail): OrderListItem {
  return {
    id: d.id,
    orderNo: d.orderNo,
    customerName: d.customerName,
    status: d.status,
    totalAmount: d.totalAmount,
    itemCount: d.itemCount,
    createdAt: d.createdAt,
  };
}

const notFound = (message: string): ApiErrorBody => ({
  statusCode: 404,
  code: 'NOT_FOUND',
  message,
});

const PAGE_DEFAULT = 20;

function pageParams(params: URLSearchParams): { page: number; size: number } {
  const page = Math.max(Number(params.get('page') ?? 1) || 1, 1);
  const size = Math.min(
    Math.max(Number(params.get('size') ?? PAGE_DEFAULT) || PAGE_DEFAULT, 1),
    100,
  );
  return { page, size };
}

function paginate<T>(all: T[], page: number, size: number): Paginated<T> {
  return {
    items: all.slice((page - 1) * size, page * size),
    meta: { page, size, total: all.length, totalPages: Math.ceil(all.length / size) },
  };
}

const ACTION_TARGET: Record<OrderAction, OrderStatus> = {
  confirm: OrderStatus.CONFIRMED,
  ship: OrderStatus.SHIPPED,
  deliver: OrderStatus.DELIVERED,
  cancel: OrderStatus.CANCELLED,
};

const ACTIONS: readonly OrderAction[] = ['confirm', 'ship', 'deliver', 'cancel'];

const SHORTAGE: InsufficientStockItem[] = [
  { productId: p1.id, sku: p1.sku, name: p1.name, requested: 5, available: 2 },
];

// ---- 재고 이력 ----------------------------------------------------------------

const REASON_CYCLE = [
  InventoryChangeReason.ORDER_CONFIRM,
  InventoryChangeReason.MANUAL_ADJUST,
  InventoryChangeReason.ORDER_CANCEL,
];

function baseHistory(productId: string): InventoryHistoryItem[] {
  return Array.from({ length: 12 }, (_, i) => {
    const reason = REASON_CYCLE[i % REASON_CYCLE.length];
    const order = orderFixtures[i];
    const isOrder = reason !== InventoryChangeReason.MANUAL_ADJUST;
    const delta =
      reason === InventoryChangeReason.ORDER_CONFIRM
        ? -2
        : reason === InventoryChangeReason.ORDER_CANCEL
          ? 2
          : 10;
    return {
      id: `${productId}-ih${i}`,
      delta,
      quantityAfter: 50 + delta,
      reason,
      note: isOrder ? null : '입고 반영',
      refOrderId: isOrder ? order.id : null,
      refOrderNo: isOrder ? order.orderNo : null,
      actorName: '관리자',
      createdAt: new Date(Date.UTC(2026, 1, 20 - i, 0, 0, 0)).toISOString(),
    };
  });
}

function productDetail(id: string): ProductDetail | null {
  const item = productFixtures.find((p) => p.id === id);
  if (!item) return null;
  const base: ProductDetail =
    id === productDetailFixture.id
      ? productDetailFixture
      : { ...item, description: '', images: [] };
  const stock = stocks.get(id) ?? item.stock;
  return { ...base, stock, isLowStock: stock <= item.safetyStock };
}

/** 주문·재고 API 기본 핸들러. */
export const orderHandlers = [
  http.get('/api/v1/orders', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const { page, size } = pageParams(params);
    const q = (params.get('q') ?? '').toLowerCase();
    const status = params.get('status');
    const [field, dir] = (params.get('sort') ?? 'createdAt:desc').split(':');
    const sign = dir === 'asc' ? 1 : -1;
    const from = params.get('from');
    const to = params.get('to');
    // from은 그날 00:00 KST부터, to는 그날 23:59:59.999 KST까지(= 다음 날 00:00 KST 미만)
    const fromMs = from ? kstDayStart(from) : undefined;
    const toMs = to ? kstDayStart(to) + DAY_MS : undefined;
    const filtered = [...orders.values()]
      .map(toListItem)
      .filter(
        (o) =>
          (!q || o.orderNo.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)) &&
          (!status || o.status === status) &&
          (fromMs === undefined || Date.parse(o.createdAt) >= fromMs) &&
          (toMs === undefined || Date.parse(o.createdAt) < toMs),
      )
      .sort((a, b) =>
        field === 'totalAmount'
          ? sign * (a.totalAmount - b.totalAmount)
          : sign * a.createdAt.localeCompare(b.createdAt),
      );
    return HttpResponse.json(paginate(filtered, page, size));
  }),
  http.get('/api/v1/orders/:id', ({ params }) => {
    const order = orders.get(String(params.id));
    if (!order) return HttpResponse.json(notFound('주문을 찾을 수 없습니다'), { status: 404 });
    return HttpResponse.json(order);
  }),
  http.post('/api/v1/orders/:id/:action', ({ params }) => {
    const order = orders.get(String(params.id));
    const action = String(params.action) as OrderAction;
    if (!order || !ACTIONS.includes(action)) {
      return HttpResponse.json(notFound('주문을 찾을 수 없습니다'), { status: 404 });
    }
    const to = nextStatus(order.status, action);
    if (!to) {
      const body: ApiErrorBody = {
        statusCode: 409,
        code: 'CONFLICT',
        message: '현재 상태에서는 처리할 수 없습니다',
        details: { from: order.status, to: ACTION_TARGET[action] },
      };
      return HttpResponse.json(body, { status: 409 });
    }
    if (action === 'confirm' && order.id === SHORT_STOCK_ORDER_ID) {
      const body: ApiErrorBody = {
        statusCode: 422,
        code: 'INSUFFICIENT_STOCK',
        message: '재고가 부족합니다',
        details: SHORTAGE,
      };
      return HttpResponse.json(body, { status: 422 });
    }
    const now = new Date().toISOString();
    const updated: OrderDetail = {
      ...order,
      status: to,
      confirmedAt: action === 'confirm' ? now : order.confirmedAt,
      cancelledAt: action === 'cancel' ? now : order.cancelledAt,
      history: [
        ...order.history,
        {
          id: `${order.id}-h${order.history.length + 1}`,
          fromStatus: order.status,
          toStatus: to,
          actorName: '관리자',
          createdAt: now,
        },
      ],
    };
    orders.set(order.id, updated);
    return HttpResponse.json(updated);
  }),
  http.post('/api/v1/dev/orders/random', async ({ request }) => {
    const { count } = (await request.json()) as { count: number };
    const created: OrderListItem[] = [];
    for (let i = 0; i < count; i += 1) {
      randomSeq += 1;
      const item: OrderListItem = {
        id: uuid(randomSeq, 'r000'),
        orderNo: `ORD-20260201-${String(randomSeq).padStart(4, '0')}`,
        customerName: `임의 고객 ${randomSeq}`,
        status: OrderStatus.PENDING,
        totalAmount: 20_000,
        itemCount: 1,
        createdAt: new Date(Date.UTC(2026, 1, 1, 0, randomSeq, 0)).toISOString(),
      };
      orders.set(item.id, buildDetail(item));
      created.push(item);
    }
    return HttpResponse.json({ created }, { status: 201 });
  }),
  http.get('/api/v1/products/:id/inventory-history', ({ params, request }) => {
    const id = String(params.id);
    if (!productDetail(id)) {
      return HttpResponse.json(notFound('상품을 찾을 수 없습니다'), { status: 404 });
    }
    const { page, size } = pageParams(new URL(request.url).searchParams);
    return HttpResponse.json(
      paginate([...(histories.get(id) ?? []), ...baseHistory(id)], page, size),
    );
  }),
  http.patch('/api/v1/products/:id/inventory', async ({ params, request }) => {
    const id = String(params.id);
    const current = productDetail(id);
    if (!current) return HttpResponse.json(notFound('상품을 찾을 수 없습니다'), { status: 404 });
    const { delta, note } = (await request.json()) as { delta: number; note: string };
    const after = current.stock + delta;
    if (after < 0) {
      const body: ApiErrorBody = {
        statusCode: 422,
        code: 'INSUFFICIENT_STOCK',
        message: '재고는 0보다 작아질 수 없습니다',
      };
      return HttpResponse.json(body, { status: 422 });
    }
    stocks.set(id, after);
    histories.set(id, [
      {
        id: `${id}-adj${(histories.get(id)?.length ?? 0) + 1}`,
        delta,
        quantityAfter: after,
        reason: InventoryChangeReason.MANUAL_ADJUST,
        note,
        refOrderId: null,
        refOrderNo: null,
        actorName: '관리자',
        createdAt: new Date().toISOString(),
      },
      ...(histories.get(id) ?? []),
    ]);
    return HttpResponse.json(productDetail(id));
  }),
];
