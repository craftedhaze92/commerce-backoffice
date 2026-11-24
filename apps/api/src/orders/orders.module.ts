import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../inventory/inventory.module.js';
import { DevOnlyGuard } from './dev-only.guard.js';
import { DevOrdersController } from './dev-orders.controller.js';
import { DevOrdersService } from './dev-orders.service.js';
import { OrderItem } from './order-item.entity.js';
import { OrderSequence } from './order-sequence.entity.js';
import { OrderTransitionsService } from './order-transitions.service.js';
import { OrderStatusHistory } from './order-status-history.entity.js';
import { Order } from './order.entity.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, OrderStatusHistory, OrderSequence]),
    InventoryModule,
  ],
  controllers: [OrdersController, DevOrdersController],
  providers: [OrdersService, OrderTransitionsService, DevOrdersService, DevOnlyGuard],
})
export class OrdersModule {}
