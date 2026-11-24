import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ORDER_LIMITS } from '@bo/contracts';

export class RandomOrdersDto {
  @ApiPropertyOptional({ minimum: 1, maximum: ORDER_LIMITS.randomMax, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ORDER_LIMITS.randomMax)
  count: number = 5;
}
