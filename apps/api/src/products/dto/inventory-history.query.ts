import { PaginationQuery } from '../../common/pagination.js';

export class InventoryHistoryQuery extends PaginationQuery {
  override size: number = 10;
}
