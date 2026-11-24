import { OrderStatus } from '@bo/contracts';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('orders')
@Index('IDX_orders_status_created', ['status', 'createdAt'])
@Index('IDX_orders_created', ['createdAt'])
@Check('CHK_orders_total_nonneg', '"totalAmount" >= 0')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  orderNo: string;

  @Column({ type: 'varchar', length: 50 })
  customerName: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  /** Σ unitPrice × quantity, in won. */
  @Column({ type: 'integer' })
  totalAmount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
