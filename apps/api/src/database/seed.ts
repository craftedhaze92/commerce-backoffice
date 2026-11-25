import { OrderStatus, ProductStatus, Role } from '@bo/contracts';
import { DataSource, In, type EntityManager } from 'typeorm';
import { hashPassword } from '../common/password.js';
import { validateEnv } from '../config/env.js';
import { Category } from '../categories/category.entity.js';
import { Inventory } from '../products/inventory.entity.js';
import { ProductImage } from '../products/product-image.entity.js';
import { nextOrderNo } from '../orders/order-number.js';
import { Product } from '../products/product.entity.js';
import { User } from '../users/user.entity.js';
import { buildDataSourceOptions } from './data-source.js';

const DEMO_USERS = [
  { email: 'admin@demo.com', name: '관리자', role: Role.ADMIN },
  { email: 'manager@demo.com', name: '매니저', role: Role.MANAGER },
  { email: 'viewer@demo.com', name: '뷰어', role: Role.VIEWER },
];

const SEED_PRNG = 20261120;
const ORDER_SEED_PRNG = 20261124;
const ORDER_COUNT = 1500;
const ORDER_WINDOW_DAYS = 90;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const MINUTE_MS = 60_000;
const CUSTOMERS = [
  '김민준',
  '이서연',
  '박지호',
  '최수아',
  '정도윤',
  '강하은',
  '조현우',
  '윤지아',
  '장서준',
  '임유나',
  '한지우',
  '오시우',
  '서예린',
  '신건우',
  '권다은',
  '황태민',
];
const PRODUCT_COUNT = 200;
const SAFETY_STOCK = 10;
/** Share of products seeded at or below safetyStock. */
const LOW_STOCK_RATIO = 0.15;

/** Category name -> [adjectives, nouns] used to build deterministic product names. */
const CATALOG: Record<string, [string[], string[]]> = {
  의류: [
    ['베이직', '오버핏', '데일리', '슬림'],
    ['티셔츠', '셔츠', '후드', '청바지', '코트'],
  ],
  신발: [
    ['클래식', '라이트', '쿠션', '캐주얼'],
    ['스니커즈', '로퍼', '러닝화', '부츠'],
  ],
  가방: [
    ['모던', '경량', '미니', '빅'],
    ['백팩', '토트백', '크로스백', '파우치'],
  ],
  액세서리: [
    ['심플', '골드', '실버', '빈티지'],
    ['목걸이', '팔찌', '벨트', '선글라스'],
  ],
  뷰티: [
    ['촉촉', '수분', '순한', '데일리'],
    ['크림', '토너', '선크림', '립밤', '세럼'],
  ],
  리빙: [
    ['아늑한', '북유럽', '미니멀', '내추럴'],
    ['쿠션', '조명', '식탁매트', '수납함', '러그'],
  ],
  디지털: [
    ['스마트', '무선', '초경량', '고속'],
    ['이어폰', '충전기', '키보드', '마우스', '케이블'],
  ],
  식품: [
    ['프리미엄', '국내산', '신선', '무가당'],
    ['견과', '그래놀라', '커피', '꿀', '올리브유'],
  ],
};
const CATEGORY_NAMES = Object.keys(CATALOG);

/** Deterministic PRNG so every seed run yields identical data. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickStatus(r: number): ProductStatus {
  if (r < 0.7) return ProductStatus.ON_SALE;
  if (r < 0.8) return ProductStatus.SOLD_OUT;
  if (r < 0.9) return ProductStatus.DRAFT;
  return ProductStatus.HIDDEN;
}

interface SeedProduct {
  sku: string;
  name: string;
  categoryName: string;
  price: number;
  status: ProductStatus;
  description: string;
  quantity: number;
}

function buildSeedProducts(): SeedProduct[] {
  const rand = mulberry32(SEED_PRNG);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)] as T;
  const products: SeedProduct[] = [];
  for (let n = 1; n <= PRODUCT_COUNT; n++) {
    const categoryName = CATEGORY_NAMES[(n - 1) % CATEGORY_NAMES.length] as string;
    const [adjectives, nouns] = CATALOG[categoryName] as [string[], string[]];
    const name = `${pick(adjectives)} ${pick(nouns)} ${n}`;
    const price = (10 + Math.floor(rand() * 2991)) * 100; // 1,000 - 300,000 in 100s
    const status = pickStatus(rand());
    const lowStock = rand() < LOW_STOCK_RATIO;
    const quantity = lowStock
      ? Math.floor(rand() * (SAFETY_STOCK + 1)) // 0 - 10
      : SAFETY_STOCK + 1 + Math.floor(rand() * (200 - SAFETY_STOCK)); // 11 - 200
    products.push({
      sku: `SKU-${String(n).padStart(4, '0')}`,
      name,
      categoryName,
      price,
      status,
      description: `${name} 상품 설명입니다.`,
      quantity,
    });
  }
  return products;
}

async function seedCatalog(dataSource: DataSource): Promise<number> {
  await dataSource.getRepository(Category).upsert(
    CATEGORY_NAMES.map((name) => ({ name })),
    ['name'],
  );
  const categories = await dataSource.getRepository(Category).find();
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

  const seeds = buildSeedProducts();
  await dataSource.transaction(async (m) => {
    // Only name/category/price/status/description are refreshed on re-run; stock is never reset.
    // ON CONFLICT must repeat the partial index predicate (live products only).
    await m.query(
      `INSERT INTO products (sku, name, "categoryId", price, status, description)
       SELECT * FROM unnest($1::text[], $2::text[], $3::uuid[], $4::int[], $5::products_status_enum[], $6::text[])
       ON CONFLICT (sku) WHERE "deletedAt" IS NULL DO UPDATE SET
         name = EXCLUDED.name, "categoryId" = EXCLUDED."categoryId", price = EXCLUDED.price,
         status = EXCLUDED.status, description = EXCLUDED.description, "updatedAt" = now()`,
      [
        seeds.map((p) => p.sku),
        seeds.map((p) => p.name),
        seeds.map((p) => categoryIdByName.get(p.categoryName)),
        seeds.map((p) => p.price),
        seeds.map((p) => p.status),
        seeds.map((p) => p.description),
      ],
    );
    const products = await m
      .getRepository(Product)
      .find({ select: { id: true, sku: true }, where: { sku: In(seeds.map((p) => p.sku)) } });
    const idBySku = new Map(products.map((p) => [p.sku, p.id]));
    await m
      .createQueryBuilder()
      .insert()
      .into(Inventory)
      .values(
        seeds.map((p) => ({
          productId: idBySku.get(p.sku) as string,
          quantity: p.quantity,
          safetyStock: SAFETY_STOCK,
        })),
      )
      .orIgnore()
      .execute();
  });
  return seeds.length;
}

interface SeedOrder {
  createdAt: Date;
  customerName: string;
  status: OrderStatus;
  /** Status path with the instant of each step (strictly increasing). */
  path: Array<{ from: OrderStatus | null; to: OrderStatus; at: Date }>;
  lines: Array<{ productId: string; sku: string; name: string; price: number; quantity: number }>;
  totalAmount: number;
}

function pickOrderStatus(r: number): OrderStatus {
  if (r < 0.55) return OrderStatus.DELIVERED;
  if (r < 0.65) return OrderStatus.SHIPPED;
  if (r < 0.75) return OrderStatus.CONFIRMED;
  if (r < 0.9) return OrderStatus.PENDING;
  return OrderStatus.CANCELLED;
}

type SeedProduct4Order = { id: string; sku: string; name: string; price: number };

function buildSeedOrders(products: SeedProduct4Order[], now: Date): SeedOrder[] {
  const rand = mulberry32(ORDER_SEED_PRNG);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const orders: SeedOrder[] = [];
  for (let n = 0; n < ORDER_COUNT; n++) {
    const status = pickOrderStatus(rand());
    // Steps after creation, as [to, delay since previous step]. Delays are >= 1 minute so history is strictly ordered.
    const steps: Array<[OrderStatus, number]> = [];
    const confirmDelay = int(1, 6) * HOUR_MS + int(0, 59) * MINUTE_MS + MINUTE_MS;
    if (status === OrderStatus.CANCELLED) {
      if (rand() < 0.3) steps.push([OrderStatus.CONFIRMED, confirmDelay]);
      steps.push([OrderStatus.CANCELLED, int(1, 24) * HOUR_MS + MINUTE_MS]);
    } else if (status !== OrderStatus.PENDING) {
      steps.push([OrderStatus.CONFIRMED, confirmDelay]);
      if (status !== OrderStatus.CONFIRMED) {
        steps.push([OrderStatus.SHIPPED, int(1, 24) * HOUR_MS + MINUTE_MS]);
        if (status === OrderStatus.DELIVERED) {
          steps.push([OrderStatus.DELIVERED, int(24, 72) * HOUR_MS + MINUTE_MS]);
        }
      }
    }
    const span = steps.reduce((sum, [, d]) => sum + d, 0);
    // Random instant in the last 90 days, early enough that the whole path is already in the past.
    const created = Math.min(
      now.getTime() - rand() * ORDER_WINDOW_DAYS * DAY_MS,
      now.getTime() - span - MINUTE_MS,
    );
    const createdAt = new Date(Math.floor(created));
    const path: SeedOrder['path'] = [{ from: null, to: OrderStatus.PENDING, at: createdAt }];
    let at = createdAt.getTime();
    let from = OrderStatus.PENDING;
    for (const [to, delay] of steps) {
      at += delay;
      path.push({ from, to, at: new Date(at) });
      from = to;
    }

    const picked = new Set<number>();
    const itemCount = int(1, 4);
    while (picked.size < itemCount) picked.add(Math.floor(rand() * products.length));
    const lines = [...picked].map((idx) => {
      const p = products[idx]!;
      return { productId: p.id, sku: p.sku, name: p.name, price: p.price, quantity: int(1, 3) };
    });
    orders.push({
      createdAt,
      customerName: CUSTOMERS[int(0, CUSTOMERS.length - 1)]!,
      status,
      path,
      lines,
      totalAmount: lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
    });
  }
  // Issue order numbers oldest-first so the per-day sequence follows creation time.
  return orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/**
 * Demo orders for the last 90 days. Only runs while the orders table is empty (idempotent).
 * Seeded orders deliberately do not touch stock or inventory history.
 */
async function seedOrders(dataSource: DataSource, now = new Date()): Promise<number> {
  const [{ c }] = (await dataSource.query('SELECT count(*)::int AS c FROM orders')) as Array<{
    c: number;
  }>;
  if (c > 0) return 0;
  const [manager] = (await dataSource.query('SELECT id FROM users WHERE email = $1', [
    'manager@demo.com',
  ])) as Array<{ id: string }>;
  const products = (await dataSource.query(
    'SELECT id, sku, name, price FROM products WHERE "deletedAt" IS NULL ORDER BY sku',
  )) as SeedProduct4Order[];
  if (!manager || products.length === 0) return 0;
  const orders = buildSeedOrders(products, now);

  await dataSource.transaction(async (m: EntityManager) => {
    const orderNos: string[] = [];
    for (const o of orders) orderNos.push(await nextOrderNo(m, o.createdAt));
    const ids = (await m.query(
      `INSERT INTO orders ("orderNo", "customerName", status, "totalAmount", "createdAt", "confirmedAt", "cancelledAt", "updatedAt")
       SELECT * FROM unnest($1::text[], $2::text[], $3::orders_status_enum[], $4::int[], $5::timestamptz[], $6::timestamptz[], $7::timestamptz[], $8::timestamptz[])
       RETURNING id, "orderNo"`,
      [
        orderNos,
        orders.map((o) => o.customerName),
        orders.map((o) => o.status),
        orders.map((o) => o.totalAmount),
        orders.map((o) => o.createdAt),
        orders.map((o) => o.path.find((s) => s.to === OrderStatus.CONFIRMED)?.at ?? null),
        orders.map((o) => o.path.find((s) => s.to === OrderStatus.CANCELLED)?.at ?? null),
        orders.map((o) => o.path[o.path.length - 1]!.at),
      ],
    )) as Array<{ id: string; orderNo: string }>;
    const idByNo = new Map(ids.map((r) => [r.orderNo, r.id]));
    const orderIds = orderNos.map((no) => idByNo.get(no) as string);

    const items = orders.flatMap((o, i) => o.lines.map((l) => ({ orderId: orderIds[i]!, ...l })));
    await m.query(
      `INSERT INTO order_items ("orderId", "productId", sku, "productName", quantity, "unitPrice")
       SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::int[], $6::int[])`,
      [
        items.map((i) => i.orderId),
        items.map((i) => i.productId),
        items.map((i) => i.sku),
        items.map((i) => i.name),
        items.map((i) => i.quantity),
        items.map((i) => i.price),
      ],
    );

    const history = orders.flatMap((o, i) => o.path.map((s) => ({ orderId: orderIds[i]!, ...s })));
    await m.query(
      `INSERT INTO order_status_histories ("orderId", "fromStatus", "toStatus", "actorId", "createdAt")
       SELECT * FROM unnest($1::uuid[], $2::order_status_histories_fromstatus_enum[], $3::order_status_histories_tostatus_enum[], $4::uuid[], $5::timestamptz[])`,
      [
        history.map((h) => h.orderId),
        history.map((h) => h.from),
        history.map((h) => h.to),
        history.map(() => manager.id),
        history.map((h) => h.at),
      ],
    );
  });
  return orders.length;
}

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is required to seed demo accounts');

  const dataSource = new DataSource({
    ...buildDataSourceOptions(env),
    entities: [User, Category, Product, Inventory, ProductImage],
  });
  await dataSource.initialize();
  try {
    const repo = dataSource.getRepository(User);
    const passwordHash = await hashPassword(password);
    await repo.upsert(
      DEMO_USERS.map((u) => ({ ...u, passwordHash, isActive: true })),
      ['email'],
    );
    console.log(`Seeded ${DEMO_USERS.length} demo users`);
    const productCount = await seedCatalog(dataSource);
    console.log(`Seeded ${CATEGORY_NAMES.length} categories, ${productCount} products`);
    const orderCount = await seedOrders(dataSource);
    console.log(orderCount > 0 ? `Seeded ${orderCount} orders` : 'Orders already present, skipped');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
