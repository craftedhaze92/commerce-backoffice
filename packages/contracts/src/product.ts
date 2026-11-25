export enum ProductStatus {
  DRAFT = 'DRAFT',
  ON_SALE = 'ON_SALE',
  SOLD_OUT = 'SOLD_OUT',
  HIDDEN = 'HIDDEN',
}

export interface Category {
  id: string;
  name: string;
}

export interface ProductImage {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductListItem {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  status: ProductStatus;
  stock: number;
  safetyStock: number;
  isLowStock: boolean;
  thumbUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends ProductListItem {
  description: string;
  images: ProductImage[];
}

/** 배열 순서가 sortOrder다. */
export interface ProductImageRef {
  id: string;
  isPrimary: boolean;
}

export interface ProductCreateInput {
  sku: string;
  name: string;
  categoryId: string;
  price: number;
  status: ProductStatus;
  description?: string;
  initialStock: number;
  safetyStock: number;
  images: ProductImageRef[];
}

export type ProductUpdateInput = Partial<Omit<ProductCreateInput, 'initialStock'>>;

export const PRODUCT_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'price', 'stock'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export type SortDir = 'asc' | 'desc';

export const PRODUCT_LIMITS = {
  maxPrice: 100_000_000,
  maxStock: 1_000_000,
  nameMax: 100,
  descriptionMax: 2000,
  imageMaxBytes: 5 * 1024 * 1024,
  imageMaxCount: 10,
  imageMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

export const SKU_PATTERN = /^[A-Z0-9-]{3,32}$/;

export function normalizeSku(raw: string): string {
  return raw.trim().toUpperCase();
}

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  [ProductStatus.DRAFT]: '임시저장',
  [ProductStatus.ON_SALE]: '판매중',
  [ProductStatus.SOLD_OUT]: '품절',
  [ProductStatus.HIDDEN]: '숨김',
};
