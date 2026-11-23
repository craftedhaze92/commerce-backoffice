import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity.js';

@Entity('inventories')
@Check('CHK_inventories_quantity_nonneg', '"quantity" >= 0')
@Check('CHK_inventories_safety_stock_nonneg', '"safetyStock" >= 0')
export class Inventory {
  @PrimaryColumn({ type: 'uuid' })
  productId: string;

  @OneToOne(() => Product, (product) => product.inventory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Relation<Product>;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'integer', default: 0 })
  safetyStock: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
