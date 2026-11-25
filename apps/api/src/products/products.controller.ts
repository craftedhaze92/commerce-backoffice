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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiCookieAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-error.schema.js';
import {
  Role,
  type InventoryHistoryItem,
  type Paginated,
  type ProductDetail,
  type ProductListItem,
} from '@bo/contracts';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators.js';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { InventoryHistoryQuery } from './dto/inventory-history.query.js';
import { ListProductsQuery } from './dto/list-products.query.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ProductsService } from './products.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiCookieAuth('bo_at')
@ApiErrors()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Roles(Role.VIEWER)
  @ApiTags('products')
  @Get()
  list(@Query() q: ListProductsQuery): Promise<Paginated<ProductListItem>> {
    return this.products.list(q);
  }

  /** Declared before ':id' so "export" is not parsed as an id. */
  @Roles(Role.MANAGER)
  @ApiTags('products')
  @ApiProduces(XLSX)
  @ApiOkResponse({
    description: 'xlsx file',
    content: { [XLSX]: { schema: { type: 'string', format: 'binary' } } },
  })
  @Get('export')
  export(@Query() q: ListProductsQuery, @Res() res: Response): Promise<void> {
    return this.products.export(q, res);
  }

  @Roles(Role.VIEWER)
  @ApiTags('products')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDetail> {
    return this.products.get(id);
  }

  @Roles(Role.MANAGER)
  @ApiTags('products')
  @Post()
  create(@Body() dto: CreateProductDto): Promise<ProductDetail> {
    return this.products.create(dto);
  }

  @Roles(Role.MANAGER)
  @ApiTags('products')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDetail> {
    return this.products.update(id, dto);
  }

  @Roles(Role.MANAGER)
  @ApiTags('inventory')
  @Patch(':id/inventory')
  adjustInventory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustInventoryDto,
    @CurrentUser() user: AuthUser,
  ): Promise<ProductDetail> {
    return this.products.adjustInventory(id, dto, user.id);
  }

  @Roles(Role.VIEWER)
  @ApiTags('inventory')
  @Get(':id/inventory-history')
  inventoryHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: InventoryHistoryQuery,
  ): Promise<Paginated<InventoryHistoryItem>> {
    return this.products.inventoryHistory(id, q);
  }

  @Roles(Role.MANAGER)
  @ApiTags('products')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.products.remove(id);
  }
}
