import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from './inventory.entity.js';
import { ProductImage } from './product-image.entity.js';
import { Product } from './product.entity.js';

@Module({ imports: [TypeOrmModule.forFeature([Product, Inventory, ProductImage])] })
export class ProductsModule {}
