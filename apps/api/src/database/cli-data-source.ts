import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.js';
import { buildDataSourceOptions } from './data-source.js';
import { RefreshToken } from '../auth/refresh-token.entity.js';
import { Category } from '../categories/category.entity.js';
import { InventoryHistory } from '../inventory/inventory-history.entity.js';
import { OrderItem } from '../orders/order-item.entity.js';
import { OrderSequence } from '../orders/order-sequence.entity.js';
import { OrderStatusHistory } from '../orders/order-status-history.entity.js';
import { Order } from '../orders/order.entity.js';
import { Inventory } from '../products/inventory.entity.js';
import { ProductImage } from '../products/product-image.entity.js';
import { Product } from '../products/product.entity.js';
import { User } from '../users/user.entity.js';

/** DataSource instance consumed by the TypeORM CLI (migration:run / generate). */
export default new DataSource({
  ...buildDataSourceOptions(validateEnv(process.env)),
  entities: [
    User,
    RefreshToken,
    Category,
    Product,
    Inventory,
    ProductImage,
    InventoryHistory,
    Order,
    OrderItem,
    OrderStatusHistory,
    OrderSequence,
  ],
});
