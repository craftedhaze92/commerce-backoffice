import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Role, type Paginated, type ProductDetail, type ProductListItem } from '@bo/contracts';
import { Roles } from '../common/decorators.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { ProductsService } from './products.service.js';

@ApiCookieAuth('bo_at')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Roles(Role.VIEWER)
  @Get()
  list(@Query() q: ListProductsQuery): Promise<Paginated<ProductListItem>> {
    return this.products.list(q);
  }

  @Roles(Role.VIEWER)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDetail> {
    return this.products.get(id);
  }
}
