import { z } from 'zod';
import { INVENTORY_LIMITS, type InventoryAdjustInput } from '@bo/contracts';

const AMOUNT_RANGE = `수량은 1 이상 ${INVENTORY_LIMITS.deltaMax.toLocaleString('ko-KR')} 이하의 정수여야 합니다`;

export const adjustInventorySchema = z
  .object({
    mode: z.enum(['in', 'out']),
    amount: z
      .string()
      .trim()
      .min(1, '수량을 입력하세요')
      .pipe(
        z.coerce
          .number<string>({ error: AMOUNT_RANGE })
          .int(AMOUNT_RANGE)
          .min(1, AMOUNT_RANGE)
          .max(INVENTORY_LIMITS.deltaMax, AMOUNT_RANGE),
      ),
    note: z
      .string()
      .trim()
      .min(1, '사유를 입력하세요')
      .max(INVENTORY_LIMITS.noteMax, `사유는 ${INVENTORY_LIMITS.noteMax}자 이하여야 합니다`),
  })
  .transform(({ mode, amount, note }): InventoryAdjustInput => ({
    delta: mode === 'in' ? amount : -amount,
    note,
  }));

export type AdjustInventoryFormInput = z.input<typeof adjustInventorySchema>;
