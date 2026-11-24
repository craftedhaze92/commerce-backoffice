import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevOnlyGuard } from './dev-only.guard.js';
import { DevOrdersController } from './dev-orders.controller.js';
import { DevOrdersService } from './dev-orders.service.js';
import { OrderItem } from './order-item.entity.js';
import { OrderSequence } from './order-sequence.entity.js';
import { OrderStatusHistory } from './order-status-history.entity.js';
import { Order } from './order.entity.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, OrderStatusHistory, OrderSequence])],
  controllers: [OrdersController, DevOrdersController],
  providers: [OrdersService, DevOrdersService, DevOnlyGuard],
})
export class OrdersModule {}
