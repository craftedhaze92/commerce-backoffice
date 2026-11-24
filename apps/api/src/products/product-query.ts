import { PRODUCT_SORT_FIELDS, type ProductSortField } from '@bo/contracts';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { escapeLike } from '../common/like.js';
import { parseSort } from '../common/sort.js';
import type { ListProductsQuery } from './dto/list-products.query.js';

const SORT_COLUMNS: Record<ProductSortField, string> = {
  createdAt: 'p.createdAt',
  updatedAt: 'p.updatedAt',
  name: 'p.name',
  price: 'p.price',
  stock: 'i.quantity',
};

/**
 * Applies filters and ordering to a query builder that selects FROM products AS p
 * and has inventories joined as i.
 */
export function applyProductFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  q: ListProductsQuery,
): SelectQueryBuilder<T> {
  if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) {
    throw new AppException(400, 'VALIDATION_FAILED', 'Invalid price range', [
      { field: 'minPrice', messages: ['minPrice must be ≤ maxPrice'] },
    ]);
  }
  qb.andWhere('p.deletedAt IS NULL');
  if (q.q) {
    qb.andWhere(`(p.name ILIKE :q ESCAPE '\\' OR p.sku ILIKE :q ESCAPE '\\')`, {
      q: `%${escapeLike(q.q)}%`,
    });
  }
  if (q.categoryId) qb.andWhere('p.categoryId = :categoryId', { categoryId: q.categoryId });
  if (q.status) qb.andWhere('p.status = :status', { status: q.status });
  if (q.minPrice !== undefined) qb.andWhere('p.price >= :minPrice', { minPrice: q.minPrice });
  if (q.maxPrice !== undefined) qb.andWhere('p.price <= :maxPrice', { maxPrice: q.maxPrice });
  if (q.lowStock) qb.andWhere('i.quantity <= i.safetyStock');
  return qb;
}

export function buildProductListQuery<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  q: ListProductsQuery,
): SelectQueryBuilder<T> {
  const { field, dir } = parseSort(q.sort, PRODUCT_SORT_FIELDS, {
    field: 'createdAt',
    dir: 'desc',
  });
  applyProductFilters(qb, q);
  return qb.orderBy(SORT_COLUMNS[field], dir === 'asc' ? 'ASC' : 'DESC').addOrderBy('p.id', 'ASC');
}
