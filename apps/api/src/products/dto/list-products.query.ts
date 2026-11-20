import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PRODUCT_LIMITS, ProductStatus } from '@bo/contracts';
import { PaginationQuery } from '../../common/pagination.js';

/** Empty/whitespace -> absent; digits only -> number; anything else stays a string and fails @IsInt. */
const toPrice = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (t === '') return undefined;
  return /^\d+$/.test(t) ? Number(t) : value;
};

export class ListProductsQuery extends PaginationQuery {
  /** Trimmed; empty after trimming means "no search". */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(50)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @Transform(toPrice)
  @IsInt()
  @Min(0)
  @Max(PRODUCT_LIMITS.maxPrice)
  minPrice?: number;

  @IsOptional()
  @Transform(toPrice)
  @IsInt()
  @Min(0)
  @Max(PRODUCT_LIMITS.maxPrice)
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  lowStock?: boolean;

  /** `field:dir`; validated against the whitelist by parseSort. */
  @IsOptional()
  @IsString()
  sort?: string;
}
