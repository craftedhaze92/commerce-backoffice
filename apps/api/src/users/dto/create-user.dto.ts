import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { Role, USER_LIMITS, type CreateUserInput } from '@bo/contracts';
import { normalizeEmail } from '../../common/email.js';

export const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateUserDto implements CreateUserInput {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  @MaxLength(USER_LIMITS.emailMax)
  email: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(USER_LIMITS.nameMax)
  name: string;

  @IsEnum(Role)
  role: Role;

  @IsString()
  @MinLength(USER_LIMITS.passwordMin)
  @MaxLength(USER_LIMITS.passwordMax)
  password: string;
}
