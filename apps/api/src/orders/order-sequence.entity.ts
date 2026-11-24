import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Per-KST-day counter behind order numbers; written only via nextOrderNo(). */
@Entity('order_sequences')
export class OrderSequence {
  @PrimaryColumn({ type: 'date' })
  day: string;

  @Column({ type: 'integer' })
  last: number;
}
