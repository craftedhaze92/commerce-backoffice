import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Role, type OrderDetail, type OrderListItem, type Paginated } from '@bo/contracts';
import { Roles } from '../common/decorators.js';
import { ListOrdersQuery } from './dto/list-orders.query.js';
import { OrdersService } from './orders.service.js';

@ApiCookieAuth('bo_at')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Roles(Role.VIEWER)
  @Get()
  list(@Query() q: ListOrdersQuery): Promise<Paginated<OrderListItem>> {
    return this.orders.list(q);
  }

  @Roles(Role.VIEWER)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<OrderDetail> {
    return this.orders.get(id);
  }
}
