import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto.js';

/** Every field optional; `initialStock` is create-only. */
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['initialStock'])) {}
