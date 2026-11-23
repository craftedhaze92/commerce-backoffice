import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PRODUCT_LIMITS, ProductStatus, SKU_PATTERN, normalizeSku } from '@bo/contracts';

export const toSku = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeSku(value) : value;

export class ProductImageRefDto {
  @IsUUID()
  id: string;

  @IsBoolean()
  isPrimary: boolean;
}

export class CreateProductDto {
  @Transform(toSku)
  @IsString()
  @Matches(SKU_PATTERN, { message: 'sku must match /^[A-Z0-9-]{3,32}$/ after trimming' })
  sku: string;

  @IsString()
  @MinLength(1)
  @MaxLength(PRODUCT_LIMITS.nameMax)
  name: string;

  @IsUUID()
  categoryId: string;

  @IsInt()
  @Min(0)
  @Max(PRODUCT_LIMITS.maxPrice)
  price: number;

  @IsEnum(ProductStatus)
  status: ProductStatus;

  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_LIMITS.descriptionMax)
  description?: string;

  @IsInt()
  @Min(0)
  @Max(PRODUCT_LIMITS.maxStock)
  initialStock: number;

  @IsInt()
  @Min(0)
  @Max(PRODUCT_LIMITS.maxStock)
  safetyStock: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageRefDto)
  images: ProductImageRefDto[];
}
