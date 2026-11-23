import type {
  ProductImage as ProductImageDto,
  ProductListItem,
  ProductStatus,
} from '@bo/contracts';
import type { ProductImage } from './product-image.entity.js';

export const mediaUrl = (key: string): string => `/media/${key}`;

/** Raw row produced by ProductsService's list select. */
export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  status: ProductStatus;
  stock: number;
  safetyStock: number;
  thumbKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  description?: string;
}

export function toListItem(r: ProductRow): ProductListItem {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    price: r.price,
    status: r.status,
    stock: r.stock,
    safetyStock: r.safetyStock,
    isLowStock: r.stock <= r.safetyStock,
    thumbUrl: r.thumbKey ? mediaUrl(r.thumbKey) : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export function toImage(i: ProductImage): ProductImageDto {
  return {
    id: i.id,
    url: mediaUrl(i.objectKey),
    thumbUrl: mediaUrl(i.thumbKey),
    width: i.width,
    height: i.height,
    sortOrder: i.sortOrder,
    isPrimary: i.isPrimary,
  };
}
