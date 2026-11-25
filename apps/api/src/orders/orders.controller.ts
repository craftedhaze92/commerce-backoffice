import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../common/api-error.schema.js';
import type { Response } from 'express';
import { Role, type OrderDetail, type OrderListItem, type Paginated } from '@bo/contracts';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators.js';
import { ListOrdersQuery } from './dto/list-orders.query.js';
import { OrderTransitionsService } from './order-transitions.service.js';
import { OrdersService } from './orders.service.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiCookieAuth('bo_at')
@ApiTags('orders')
@ApiErrors()
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

  /** Declared before ':id' so "export" is not parsed as an id. */
  @Roles(Role.MANAGER)
  @Get('export')
  @ApiProduces(XLSX)
  @ApiOkResponse({
    description: 'xlsx file',
    content: { [XLSX]: { schema: { type: 'string', format: 'binary' } } },
  })
  export(@Query() q: ListOrdersQuery, @Res() res: Response): Promise<void> {
    return this.orders.export(q, res);
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
