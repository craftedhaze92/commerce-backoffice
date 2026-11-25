import 'reflect-metadata';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, ApiResponse } from '@nestjs/swagger';
import type { ApiErrorBody as ApiErrorBodyContract, ErrorCode } from '@bo/contracts';

const ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'TOKEN_REUSED',
  'FORBIDDEN',
  'CSRF_REQUIRED',
  'NOT_FOUND',
  'CONFLICT',
  'INSUFFICIENT_STOCK',
  'EXPORT_TOO_LARGE',
  'DEMO_PROTECTED',
  'TOO_MANY_REQUESTS',
  'INTERNAL',
] as const satisfies readonly ErrorCode[];

/** Swagger schema for the shared error body (the contract type is an interface, so it needs a class here). */
export class ApiErrorBody implements ApiErrorBodyContract {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ enum: ERROR_CODES, example: 'FORBIDDEN' })
  code!: ErrorCode;

  @ApiProperty({ example: 'Forbidden' })
  message!: string;

  @ApiPropertyOptional({ description: 'Validation failures or shortage list, depending on code.' })
  details?: unknown;
}

/** Representative error responses for a controller or route. Defaults to the guard errors. */
export function ApiErrors(...statuses: number[]): MethodDecorator & ClassDecorator {
  const list = statuses.length > 0 ? statuses : [401, 403];
  const description: Record<number, string> = {
    400: 'Validation failed',
    401: 'Not authenticated',
    403: 'Role too low, or CSRF header missing',
    404: 'Not found',
    409: 'Conflict with current state',
    429: 'Too many attempts; see Retry-After',
  };
  return applyDecorators(
    ...list.map((status) =>
      ApiResponse({ status, description: description[status] ?? 'Error', type: ApiErrorBody }),
    ),
  ) as MethodDecorator & ClassDecorator;
}
