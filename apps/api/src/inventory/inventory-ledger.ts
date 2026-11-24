import type { InsufficientStockItem, InventoryChangeReason } from '@bo/contracts';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppException } from '../common/app-exception.js';

export interface StockChange {
  productId: string;
  delta: number;
}

export interface LedgerContext {
  reason: InventoryChangeReason;
  actorId: string | null;
  refOrderId?: string;
  note?: string;
}

export type LedgerResult =
  { ok: true; after: Map<string, number> } | { ok: false; shortages: InsufficientStockItem[] };

interface LockedRow {
  productId: string;
  quantity: number;
  sku: string;
  name: string;
}

/**
 * Single entry point for every stock change. Rows are locked in productId order so concurrent
 * transactions never deadlock. Works on tables via SQL (no domain entity imports) and never throws
 * for shortages: the caller decides whether to roll back by throwing.
 */
@Injectable()
export class InventoryLedger {
  async apply(m: EntityManager, changes: StockChange[], ctx: LedgerContext): Promise<LedgerResult> {
    const merged = new Map<string, number>();
    for (const c of changes) merged.set(c.productId, (merged.get(c.productId) ?? 0) + c.delta);
    if (merged.size === 0) return { ok: true, after: new Map() };

    const ids = [...merged.keys()];
    const rows = (await m.query(
      `SELECT i."productId", i.quantity, p.sku, p.name
         FROM inventories i JOIN products p ON p.id = i."productId"
        WHERE i."productId" = ANY($1::uuid[])
        ORDER BY i."productId" FOR UPDATE OF i`,
      [ids],
    )) as LockedRow[];

    if (rows.length !== ids.length) {
      const found = new Set(rows.map((r) => r.productId));
      throw new AppException(
        404,
        'NOT_FOUND',
        '재고 정보를 찾을 수 없는 상품이 있습니다.',
        ids.filter((id) => !found.has(id)),
      );
    }

    const shortages: InsufficientStockItem[] = [];
    for (const r of rows) {
      const delta = merged.get(r.productId)!;
      if (r.quantity + delta < 0) {
        shortages.push({
          productId: r.productId,
          sku: r.sku,
          name: r.name,
          requested: -delta,
          available: r.quantity,
        });
      }
    }
    if (shortages.length > 0) return { ok: false, shortages };

    const after = new Map<string, number>();
    for (const r of rows) {
      const delta = merged.get(r.productId)!;
      if (delta === 0) continue;
      // TypeORM's postgres driver returns [rows, affectedCount] for UPDATE ... RETURNING.
      const [[updated]] = (await m.query(
        `UPDATE inventories SET quantity = quantity + $2, "updatedAt" = now()
          WHERE "productId" = $1 RETURNING quantity`,
        [r.productId, delta],
      )) as [Array<{ quantity: number }>, number];
      const quantityAfter = updated!.quantity;
      await m.query(
        `INSERT INTO inventory_histories ("productId", delta, "quantityAfter", reason, note, "refOrderId", "actorId")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          r.productId,
          delta,
          quantityAfter,
          ctx.reason,
          ctx.note ?? null,
          ctx.refOrderId ?? null,
          ctx.actorId,
        ],
      );
      after.set(r.productId, quantityAfter);
    }
    return { ok: true, after };
  }
}
