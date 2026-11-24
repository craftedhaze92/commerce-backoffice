import { ORDER_SORT_FIELDS, type OrderSortField } from '@bo/contracts';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { escapeLike } from '../common/like.js';
import { kstDayRange } from '../common/kst-range.js';
import { parseSort } from '../common/sort.js';
import type { ListOrdersQuery } from './dto/list-orders.query.js';

const SORT_COLUMNS: Record<OrderSortField, string> = {
  createdAt: 'o.createdAt',
  totalAmount: 'o.totalAmount',
};

/** Applies filters to a query builder that selects FROM orders AS o. Shared by count and list. */
export function applyOrderFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  q: ListOrdersQuery,
): SelectQueryBuilder<T> {
  const range = kstDayRange(q.from, q.to);
  if (q.status) qb.andWhere('o.status = :status', { status: q.status });
  if (range.gte) qb.andWhere('o.createdAt >= :gte', { gte: range.gte });
  if (range.lt) qb.andWhere('o.createdAt < :lt', { lt: range.lt });
  if (q.q) {
    qb.andWhere(`(o.orderNo ILIKE :q ESCAPE '\\' OR o.customerName ILIKE :q ESCAPE '\\')`, {
      q: `%${escapeLike(q.q)}%`,
    });
  }
  return qb;
}

export function buildOrderListQuery<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  q: ListOrdersQuery,
): SelectQueryBuilder<T> {
  const { field, dir } = parseSort(q.sort, ORDER_SORT_FIELDS, { field: 'createdAt', dir: 'desc' });
  applyOrderFilters(qb, q);
  return qb.orderBy(SORT_COLUMNS[field], dir === 'asc' ? 'ASC' : 'DESC').addOrderBy('o.id', 'ASC');
}
