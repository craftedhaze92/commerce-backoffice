import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CLOCK, type Clock } from '../common/clock.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { Inventory } from './inventory.entity.js';
import { ProductImagesController } from './images/product-images.controller.js';
import { ProductImagesService } from './images/product-images.service.js';
import { ProductImage } from './product-image.entity.js';
import { Product } from './product.entity.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

const systemClock: Clock = () => new Date();

@Module({
  imports: [TypeOrmModule.forFeature([Product, Inventory, ProductImage]), InventoryModule],
  controllers: [ProductsController, ProductImagesController],
  providers: [ProductsService, ProductImagesService, { provide: CLOCK, useValue: systemClock }],
})
export class ProductsModule {}
