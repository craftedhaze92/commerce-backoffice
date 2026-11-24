import { z } from 'zod';
import { DEFAULT_SALES_TREND_DAYS, SALES_TREND_DAYS, type SalesTrendDays } from '@bo/contracts';

/** 대시보드 URL 쿼리의 스키마. 허용 밖의 기간은 기본값(30일)이 된다. */
export const dashboardSchema = z.object({
  days: z.coerce
    .number()
    .refine((n): n is SalesTrendDays => (SALES_TREND_DAYS as readonly number[]).includes(n))
    .catch(DEFAULT_SALES_TREND_DAYS),
});
