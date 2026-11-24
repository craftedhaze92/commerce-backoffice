import { OrderStatus } from '@bo/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('order_status_histories')
@Index('IDX_order_status_histories_order_created', ['orderId', 'createdAt'])
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ForeignKey('orders', { name: 'FK_order_status_histories_order', onDelete: 'CASCADE' })
  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'enum', enum: OrderStatus, nullable: true })
  fromStatus: OrderStatus | null;

  @Column({ type: 'enum', enum: OrderStatus })
  toStatus: OrderStatus;

  @ForeignKey('users', { name: 'FK_order_status_histories_actor', onDelete: 'SET NULL' })
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
