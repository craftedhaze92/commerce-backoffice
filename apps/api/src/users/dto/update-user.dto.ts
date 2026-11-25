import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Role, USER_LIMITS, type UpdateUserInput } from '@bo/contracts';
import { trimString } from './create-user.dto.js';

const skipWhenAbsent = () => ValidateIf((_, value) => value !== undefined);

/**
 * Every field optional, but none nullable: an absent key is skipped while an explicit `null`
 * still runs the validators and is rejected. An empty body is rejected by the service.
 */
export class UpdateUserDto implements UpdateUserInput {
  @ApiPropertyOptional({ enum: Role })
  @skipWhenAbsent()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @skipWhenAbsent()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ minLength: 1, maxLength: USER_LIMITS.nameMax })
  @skipWhenAbsent()
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(USER_LIMITS.nameMax)
  name?: string;
}
