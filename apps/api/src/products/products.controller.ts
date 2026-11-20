import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Role, type Paginated, type ProductDetail, type ProductListItem } from '@bo/contracts';
import { Roles } from '../common/decorators.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
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

  @Roles(Role.MANAGER)
  @Post()
  create(@Body() dto: CreateProductDto): Promise<ProductDetail> {
    return this.products.create(dto);
  }

  @Roles(Role.MANAGER)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetail> {
    return this.products.update(id, dto);
  }

  @Roles(Role.MANAGER)
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.products.remove(id);
  }
}
