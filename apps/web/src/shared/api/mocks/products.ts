import {
  ProductStatus,
  type ApiErrorBody,
  type Category,
  type Paginated,
  type ProductDetail,
  type ProductImage,
  type ProductListItem,
} from '@bo/contracts';
import { http, HttpResponse } from 'msw';

const uuid = (n: number, prefix = '0000') =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(8, '0')}`;

export const categoryFixtures: Category[] = [
  '상의',
  '하의',
  '아우터',
  '신발',
  '가방',
  '액세서리',
  '홈웨어',
  '스포츠',
].map((name, i) => ({ id: uuid(i + 1, 'c000'), name }));

const STATUSES = [
  ProductStatus.ON_SALE,
  ProductStatus.ON_SALE,
  ProductStatus.ON_SALE,
  ProductStatus.SOLD_OUT,
  ProductStatus.DRAFT,
  ProductStatus.HIDDEN,
];

/** 25개, 결정적. 5의 배수 번째는 재고 부족, 4·9·14번째는 썸네일 없음. */
export const productFixtures: ProductListItem[] = Array.from({ length: 25 }, (_, idx) => {
  const n = idx + 1;
  const category = categoryFixtures[idx % categoryFixtures.length];
  const lowStock = n % 5 === 0;
  const status = STATUSES[idx % STATUSES.length];
  const safetyStock = 10;
  const stock = status === ProductStatus.SOLD_OUT ? 0 : lowStock ? 3 : 20 + n;
  return {
    id: uuid(n, '0000'),
    sku: `SKU-${String(n).padStart(4, '0')}`,
    name: `테스트 상품 ${n}`,
    categoryId: category.id,
    categoryName: category.name,
    price: 10_000 + n * 1_000,
    status,
    stock,
    safetyStock,
    isLowStock: stock <= safetyStock,
    thumbUrl: n === 4 || n === 9 || n === 14 ? null : `/media/products/${n}/thumb.webp`,
    createdAt: new Date(Date.UTC(2026, 0, n, 0, 0, 0)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 1, n, 0, 0, 0)).toISOString(),
  };
});

export const productDetailFixture: ProductDetail = {
  ...productFixtures[0],
  description: '상품 상세 설명입니다.',
  images: [
    {
      id: uuid(1, 'i000'),
      url: '/media/products/1/a.webp',
      thumbUrl: '/media/products/1/a-thumb.webp',
      width: 800,
      height: 800,
      sortOrder: 0,
      isPrimary: true,
    },
    {
      id: uuid(2, 'i000'),
      url: '/media/products/1/b.webp',
      thumbUrl: '/media/products/1/b-thumb.webp',
      width: 800,
      height: 600,
      sortOrder: 1,
      isPrimary: false,
    },
  ],
};

const notFound: ApiErrorBody = {
  statusCode: 404,
  code: 'NOT_FOUND',
  message: '상품을 찾을 수 없습니다',
};

/** 상품 API 기본 핸들러. page·size·q·status만 흉내 낸다. */
export const productHandlers = [
  http.get('/api/v1/categories', () => HttpResponse.json(categoryFixtures)),
  http.get('/api/v1/products', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const page = Math.max(Number(params.get('page') ?? 1) || 1, 1);
    const size = Math.min(Math.max(Number(params.get('size') ?? 20) || 20, 1), 100);
    const q = (params.get('q') ?? '').toLowerCase();
    const status = params.get('status');
    const filtered = productFixtures.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) &&
        (!status || p.status === status),
    );
    const body: Paginated<ProductListItem> = {
      items: filtered.slice((page - 1) * size, page * size),
      meta: { page, size, total: filtered.length, totalPages: Math.ceil(filtered.length / size) },
    };
    return HttpResponse.json(body);
  }),
  http.get('/api/v1/products/:id', ({ params }) => {
    if (params.id === productDetailFixture.id) return HttpResponse.json(productDetailFixture);
    const item = productFixtures.find((p) => p.id === params.id);
    if (!item) return HttpResponse.json(notFound, { status: 404 });
    return HttpResponse.json({ ...item, description: '', images: [] } satisfies ProductDetail);
  }),
  http.post('/api/v1/products/images', () => {
    const id = crypto.randomUUID();
    const image: ProductImage = {
      id,
      url: `/media/uploads/${id}.webp`,
      thumbUrl: `/media/uploads/${id}-thumb.webp`,
      width: 800,
      height: 800,
      sortOrder: 0,
      isPrimary: false,
    };
    return HttpResponse.json(image, { status: 201 });
  }),
];
