import { OmitType } from '@nestjs/swagger';
import type { Type } from '@nestjs/common';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { PRODUCT_LIMITS } from '@bo/contracts';
import { CreateProductDto } from './create-product.dto.js';

type UpdateFields = Partial<Omit<CreateProductDto, 'initialStock'>>;

/**
 * Every field optional, but none nullable: an absent key (undefined) is skipped, while an
 * explicit `null` still runs the field's validators and is rejected. PartialType would apply
 * @IsOptional, which also lets `null` through. `initialStock` is create-only.
 */
export class UpdateProductDto extends (OmitType(CreateProductDto, [
  'initialStock',
]) as Type<UpdateFields>) {}

const skipWhenAbsent = ValidateIf((_, value) => value !== undefined);
for (const key of ['sku', 'name', 'categoryId', 'price', 'status', 'safetyStock', 'images']) {
  skipWhenAbsent(UpdateProductDto.prototype, key);
}

// CreateProductDto marks description @IsOptional (null-tolerant), so it is redeclared here.
const description = [skipWhenAbsent, IsString(), MaxLength(PRODUCT_LIMITS.descriptionMax)];
for (const decorate of description) decorate(UpdateProductDto.prototype, 'description');
