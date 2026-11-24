import { InventoryChangeReason } from '@bo/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Append-only stock change log. The FKs to products/users (and, from M3 Task 4, orders) live in the
 * migration, not as relations: inventory/ is a sub-module and must not import other domains' entities.
 */
@Entity('inventory_histories')
@Index('IDX_inventory_histories_product_created', ['productId', 'createdAt'])
export class InventoryHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ForeignKey('products', { name: 'FK_inventory_histories_product', onDelete: 'CASCADE' })
  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'integer' })
  delta: number;

  @Column({ type: 'integer' })
  quantityAfter: number;

  @Column({ type: 'enum', enum: InventoryChangeReason })
  reason: InventoryChangeReason;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @Column({ type: 'uuid', nullable: true })
  refOrderId: string | null;

  @ForeignKey('users', { name: 'FK_inventory_histories_actor', onDelete: 'SET NULL' })
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
