import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Product } from './product.entity.js';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null while an uploaded image is not yet attached to a product. */
  @Index('IDX_product_images_productId')
  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @ManyToOne(() => Product, (product) => product.images, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product> | null;

  @Column({ type: 'varchar', unique: true })
  objectKey: string;

  @Column({ type: 'varchar' })
  thumbKey: string;

  @Column({ type: 'integer' })
  width: number;

  @Column({ type: 'integer' })
  height: number;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: false })
  isPrimary: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
