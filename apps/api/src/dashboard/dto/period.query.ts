import 'reflect-metadata';
import { Type } from 'class-transformer';
import { IsIn } from 'class-validator';
import { DEFAULT_SALES_TREND_DAYS, SALES_TREND_DAYS, type SalesTrendDays } from '@bo/contracts';

export class PeriodQuery {
  @Type(() => Number)
  @IsIn(SALES_TREND_DAYS)
  days: SalesTrendDays = DEFAULT_SALES_TREND_DAYS;
}
