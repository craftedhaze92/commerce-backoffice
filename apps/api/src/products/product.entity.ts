import { ProductStatus, normalizeSku } from '@bo/contracts';
import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from '../categories/category.entity.js';
import { Inventory } from './inventory.entity.js';
import { ProductImage } from './product-image.entity.js';

/**
 * The partial unique index on (sku) WHERE "deletedAt" IS NULL lets a soft-deleted
 * SKU be reused; the migration creates it by hand and this decorator mirrors it so
 * the schema diff stays clean.
 */
@Entity('products')
@Index('UQ_products_sku_live', ['sku'], { unique: true, where: '"deletedAt" IS NULL' })
@Check('CHK_products_price_nonneg', '"price" >= 0')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Always stored trimmed + uppercase (enforced on write by the transformer). */
  @Column({
    type: 'varchar',
    length: 32,
    transformer: {
      to: (v: unknown) => (typeof v === 'string' ? normalizeSku(v) : v),
      from: (v: string) => v,
    },
  })
  sku: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => Category, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column({ type: 'integer' })
  price: number;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.DRAFT,
  })
  status: ProductStatus;

  @Column({ type: 'text', default: '' })
  description: string;

  @OneToOne(() => Inventory, (inventory) => inventory.product)
  inventory: Relation<Inventory>;

  @OneToMany(() => ProductImage, (image) => image.product)
  images: Relation<ProductImage[]>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deletedAt: Date | null;
}
