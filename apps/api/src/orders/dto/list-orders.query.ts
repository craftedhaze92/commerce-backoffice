import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ORDER_LIMITS, OrderStatus } from '@bo/contracts';
import { PaginationQuery } from '../../common/pagination.js';

/** Trimmed; empty after trimming means "absent". */
const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class ListOrdersQuery extends PaginationQuery {
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(ORDER_LIMITS.qMax)
  q?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** `YYYY-MM-DD` (KST); the format is validated by kstDayRange. */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  from?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  to?: string;

  /** `field:dir`; validated against the whitelist by parseSort. */
  @IsOptional()
  @IsString()
  sort?: string;
}
