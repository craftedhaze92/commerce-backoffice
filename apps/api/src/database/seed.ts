import { ProductStatus, Role } from '@bo/contracts';
import { DataSource, In } from 'typeorm';
import { hashPassword } from '../auth/password.js';
import { validateEnv } from '../config/env.js';
import { Category } from '../categories/category.entity.js';
import { Inventory } from '../products/inventory.entity.js';
import { ProductImage } from '../products/product-image.entity.js';
import { Product } from '../products/product.entity.js';
import { User } from '../users/user.entity.js';
import { buildDataSourceOptions } from './data-source.js';

const DEMO_USERS = [
  { email: 'admin@demo.com', name: '관리자', role: Role.ADMIN },
  { email: 'manager@demo.com', name: '매니저', role: Role.MANAGER },
  { email: 'viewer@demo.com', name: '뷰어', role: Role.VIEWER },
];

const SEED_PRNG = 20261120;
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
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
