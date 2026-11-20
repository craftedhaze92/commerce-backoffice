import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Paginated, ProductDetail, ProductListItem } from '@bo/contracts';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { toPaginated } from '../common/pagination.js';
import type { ListProductsQuery } from './dto/list-products.query.js';
import { ProductImage } from './product-image.entity.js';
import { toImage, toListItem, type ProductRow } from './product-mapper.js';
import { applyProductFilters, buildProductListQuery } from './product-query.js';
import { Product } from './product.entity.js';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductImage) private readonly images: Repository<ProductImage>,
  ) {}

  private baseQuery(): SelectQueryBuilder<Product> {
    return this.products
      .createQueryBuilder('p')
      .innerJoin('p.category', 'c')
      .innerJoin('p.inventory', 'i');
  }

  /** One query: category name, inventory and the primary image's thumbKey come along as columns. */
  private selectRow<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> {
    return qb
      .select('p.id', 'id')
      .addSelect('p.sku', 'sku')
      .addSelect('p.name', 'name')
      .addSelect('p.categoryId', 'categoryId')
      .addSelect('c.name', 'categoryName')
      .addSelect('p.price', 'price')
      .addSelect('p.status', 'status')
      .addSelect('p.description', 'description')
      .addSelect('p.createdAt', 'createdAt')
      .addSelect('p.updatedAt', 'updatedAt')
      .addSelect('i.quantity', 'stock')
      .addSelect('i.safetyStock', 'safetyStock')
      .addSelect(
        (sub) =>
          sub
            .select('img.thumbKey')
            .from(ProductImage, 'img')
            .where('img.productId = p.id')
            .andWhere('img.isPrimary = true')
            .orderBy('img.sortOrder', 'ASC')
            .addOrderBy('img.createdAt', 'ASC')
            .limit(1),
        'thumbKey',
      );
  }

  async list(q: ListProductsQuery): Promise<Paginated<ProductListItem>> {
    const total = await applyProductFilters(this.baseQuery(), q).getCount();
    const rows = await buildProductListQuery(this.selectRow(this.baseQuery()), q)
      .offset((q.page - 1) * q.size)
      .limit(q.size)
      .getRawMany<ProductRow>();
    return toPaginated(rows.map(toListItem), total, q.page, q.size);
  }

  async get(id: string): Promise<ProductDetail> {
    const row = await this.selectRow(this.baseQuery())
      .where('p.id = :id', { id })
      .andWhere('p.deletedAt IS NULL')
      .getRawOne<ProductRow>();
    if (!row) throw new AppException(404, 'NOT_FOUND', 'Product not found');
    const images = await this.images.find({
      where: { productId: id },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return { ...toListItem(row), description: row.description ?? '', images: images.map(toImage) };
  }
}
