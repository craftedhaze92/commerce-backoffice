import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength, NotEquals } from 'class-validator';
import { INVENTORY_LIMITS, type InventoryAdjustInput } from '@bo/contracts';

export class AdjustInventoryDto implements InventoryAdjustInput {
  @ApiProperty({ minimum: -INVENTORY_LIMITS.deltaMax, maximum: INVENTORY_LIMITS.deltaMax })
  @IsInt()
  @NotEquals(0)
  @Min(-INVENTORY_LIMITS.deltaMax)
  @Max(INVENTORY_LIMITS.deltaMax)
  delta: number;

  @ApiProperty({ minLength: 1, maxLength: INVENTORY_LIMITS.noteMax })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(INVENTORY_LIMITS.noteMax)
  note: string;
}
