import 'reflect-metadata';
import { Type } from 'class-transformer';
import { IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DEFAULT_SALES_TREND_DAYS, SALES_TREND_DAYS, type SalesTrendDays } from '@bo/contracts';

export class PeriodQuery {
  @ApiPropertyOptional({
    type: Number,
    enum: SALES_TREND_DAYS,
    default: DEFAULT_SALES_TREND_DAYS,
    description: 'Look-back window in days',
  })
  @Type(() => Number)
  @IsIn(SALES_TREND_DAYS)
  days: SalesTrendDays = DEFAULT_SALES_TREND_DAYS;
}
