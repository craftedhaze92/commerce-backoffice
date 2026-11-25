import { Controller, HttpCode, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../common/api-error.schema.js';
import { PRODUCT_LIMITS, Role, type ProductImage } from '@bo/contracts';
import { Roles } from '../../common/decorators.js';
import { ProductImagesService } from './product-images.service.js';

@ApiCookieAuth('bo_at')
@ApiTags('product-images')
@ApiErrors(400, 401, 403)
@Controller('products/images')
export class ProductImagesController {
  constructor(private readonly service: ProductImagesService) {}

  @Roles(Role.MANAGER)
  @Post()
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PRODUCT_LIMITS.imageMaxBytes, files: 1, fields: 0, parts: 2 },
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File | undefined): Promise<ProductImage> {
    return this.service.upload(file?.buffer);
  }
}
