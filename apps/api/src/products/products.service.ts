import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  PRODUCT_LIMITS,
  type Paginated,
  type ProductDetail,
  type ProductImageRef,
  type ProductListItem,
} from '@bo/contracts';
import {
  DataSource,
  type EntityManager,
  type ObjectLiteral,
  QueryFailedError,
  Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import { AppException } from '../common/app-exception.js';
import { toPaginated } from '../common/pagination.js';
import { Category } from '../categories/category.entity.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { ListProductsQuery } from './dto/list-products.query.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import { Inventory } from './inventory.entity.js';
import { ProductImage } from './product-image.entity.js';
import { toImage, toListItem, type ProductRow } from './product-mapper.js';
import { applyProductFilters, buildProductListQuery } from './product-query.js';
import { Product } from './product.entity.js';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductImage) private readonly images: Repository<ProductImage>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private baseQuery(): SelectQueryBuilder<Product> {
    return this.products
      .createQueryBuilder('p')
      .innerJoin('p.category', 'c')
      .innerJoin('p.inventory', 'i');
  }

  /** One query: category name, inventory and the primary image's thumbKey come along as columns. */
  private selectRow<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    withDescription = false,
  ): SelectQueryBuilder<T> {
    qb.select('p.id', 'id')
      .addSelect('p.sku', 'sku')
      .addSelect('p.name', 'name')
      .addSelect('p.categoryId', 'categoryId')
      .addSelect('c.name', 'categoryName')
      .addSelect('p.price', 'price')
      .addSelect('p.status', 'status')
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
    if (withDescription) qb.addSelect('p.description', 'description');
    return qb;
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
    const row = await this.selectRow(this.baseQuery(), true)
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

  async create(dto: CreateProductDto): Promise<ProductDetail> {
    const id = await this.inTx(async (m) => {
      await this.assertCategory(m, dto.categoryId);
      await this.lockImages(m, dto.images, null);
      const product = await m.save(
        m.create(Product, {
          sku: dto.sku,
          name: dto.name,
          categoryId: dto.categoryId,
          price: dto.price,
          status: dto.status,
          description: dto.description ?? '',
        }),
      );
      await m.insert(Inventory, {
        productId: product.id,
        quantity: dto.initialStock,
        safetyStock: dto.safetyStock,
      });
      await this.attachImages(m, product.id, dto.images);
      return product.id;
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDetail> {
    await this.inTx(async (m) => {
      const product = await m.findOne(Product, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) throw new AppException(404, 'NOT_FOUND', 'Product not found');
      if (dto.categoryId != null) await this.assertCategory(m, dto.categoryId);

      const { images: refs, safetyStock, ...fields } = dto;
      for (const [k, v] of Object.entries(fields)) {
        if (v != null) (product as unknown as Record<string, unknown>)[k] = v;
      }
      if (refs != null) {
        const current = await m.find(ProductImage, { where: { productId: id } });
        await this.lockImages(
          m,
          refs,
          id,
          current.map((img) => img.id),
        );
        const keep = new Set(refs.map((r) => r.id));
        for (const img of current) {
          if (!keep.has(img.id)) {
            await m.update(ProductImage, img.id, {
              productId: null,
              isPrimary: false,
              sortOrder: 0,
            });
          }
        }
        await this.attachImages(m, id, refs);
      }
      if (safetyStock != null) await m.update(Inventory, { productId: id }, { safetyStock });
      // save() bumps updatedAt even when only inventory/images changed.
      product.updatedAt = new Date();
      await m.save(product);
    });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.products
      .createQueryBuilder()
      .softDelete()
      .where('id = :id AND "deletedAt" IS NULL', { id })
      .execute();
    if (!res.affected) throw new AppException(404, 'NOT_FOUND', 'Product not found');
  }

  /** Runs `fn` in one transaction and maps the live-SKU unique violation once it has rolled back. */
  private async inTx<T>(fn: (m: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction(fn);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string; constraint?: string }).code === '23505' &&
        (err.driverError as { constraint?: string }).constraint === 'UQ_products_sku_live'
      ) {
        throw new AppException(409, 'CONFLICT', 'SKU already exists', { field: 'sku' });
      }
      throw err;
    }
  }

  private async assertCategory(m: EntityManager, categoryId: string): Promise<void> {
    if (!(await m.existsBy(Category, { id: categoryId }))) {
      throw new AppException(400, 'VALIDATION_FAILED', 'Invalid category', [
        { field: 'categoryId', messages: ['category does not exist'] },
      ]);
    }
  }

  private invalidImages(reason: string): AppException {
    return new AppException(400, 'VALIDATION_FAILED', 'Invalid images', [
      { field: 'images', messages: [reason] },
    ]);
  }

  /**
   * Validates refs and row-locks the images; `ownerId` is the product they may already belong to.
   * `heldIds` (images currently attached, about to be detached or kept) are locked in the same
   * id-ordered statement so concurrent writers always acquire image locks in one global order.
   */
  private async lockImages(
    m: EntityManager,
    refs: ProductImageRef[],
    ownerId: string | null,
    heldIds: string[] = [],
  ): Promise<void> {
    if (refs.length > PRODUCT_LIMITS.imageMaxCount) {
      throw this.invalidImages(`at most ${PRODUCT_LIMITS.imageMaxCount} images`);
    }
    const ids = refs.map((r) => r.id);
    if (new Set(ids).size !== ids.length) throw this.invalidImages('duplicate image id');
    if (refs.length > 0 && refs.filter((r) => r.isPrimary).length !== 1) {
      throw this.invalidImages('exactly one primary image is required');
    }
    const lockIds = [...new Set([...ids, ...heldIds])];
    if (lockIds.length === 0) return;
    const rows = await m
      .createQueryBuilder(ProductImage, 'img')
      .setLock('pessimistic_write')
      .where('img.id IN (:...lockIds)', { lockIds })
      .orderBy('img.id')
      .getMany();
    const refIds = new Set(ids);
    const refRows = rows.filter((r) => refIds.has(r.id));
    if (refRows.length !== ids.length) throw this.invalidImages('image not found');
    if (refRows.some((r) => r.productId !== null && r.productId !== ownerId)) {
      throw this.invalidImages('image is attached to another product');
    }
  }

  private async attachImages(
    m: EntityManager,
    productId: string,
    refs: ProductImageRef[],
  ): Promise<void> {
    for (const [index, ref] of refs.entries()) {
      await m.update(ProductImage, ref.id, {
        productId,
        sortOrder: index,
        isPrimary: ref.isPrimary,
      });
    }
  }
}
