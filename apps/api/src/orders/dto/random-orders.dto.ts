import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Max, Min, ValidateIf } from 'class-validator';
import { ORDER_LIMITS } from '@bo/contracts';

export class RandomOrdersDto {
  @ApiPropertyOptional({ minimum: 1, maximum: ORDER_LIMITS.randomMax, default: 5 })
  /** Absent -> default 5; an explicit null must fail @IsInt (IsOptional would let it through). */
  @ValidateIf((_, v) => v !== undefined)
  @IsInt()
  @Min(1)
  @Max(ORDER_LIMITS.randomMax)
  count: number = 5;
}
