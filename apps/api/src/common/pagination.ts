import 'reflect-metadata';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import type { Paginated } from '@bo/contracts';

export class PaginationQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size: number = 20;
}

export function toPaginated<T>(
  items: T[],
  total: number,
  page: number,
  size: number,
): Paginated<T> {
  return { items, meta: { page, size, total, totalPages: Math.ceil(total / size) } };
}
