import { Check, Column, Entity, ForeignKey, Index, PrimaryGeneratedColumn } from 'typeorm';

/** sku/productName/unitPrice are snapshots taken at order time. */
@Entity('order_items')
@Check('CHK_order_items_quantity_positive', '"quantity" > 0')
@Check('CHK_order_items_unit_price_nonneg', '"unitPrice" >= 0')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_order_items_order')
  @ForeignKey('orders', { name: 'FK_order_items_order', onDelete: 'CASCADE' })
  @Column({ type: 'uuid' })
  orderId: string;

  @Index('IDX_order_items_product')
  @ForeignKey('products', { name: 'FK_order_items_product', onDelete: 'RESTRICT' })
  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'varchar', length: 32 })
  sku: string;

  @Column({ type: 'varchar', length: 100 })
  productName: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'integer' })
  unitPrice: number;
}
