import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Role, type OrderDetail, type OrderListItem, type Paginated } from '@bo/contracts';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators.js';
import { ListOrdersQuery } from './dto/list-orders.query.js';
import { OrderTransitionsService } from './order-transitions.service.js';
import { OrdersService } from './orders.service.js';

@ApiCookieAuth('bo_at')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly transitions: OrderTransitionsService,
  ) {}

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

  @Roles(Role.MANAGER)
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDetail> {
    return this.transitions.apply(id, 'confirm', user.id);
  }

  @Roles(Role.MANAGER)
  @Post(':id/ship')
  @HttpCode(200)
  ship(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDetail> {
    return this.transitions.apply(id, 'ship', user.id);
  }

  @Roles(Role.MANAGER)
  @Post(':id/deliver')
  @HttpCode(200)
  deliver(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDetail> {
    return this.transitions.apply(id, 'deliver', user.id);
  }

  @Roles(Role.MANAGER)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDetail> {
    return this.transitions.apply(id, 'cancel', user.id);
  }
}
