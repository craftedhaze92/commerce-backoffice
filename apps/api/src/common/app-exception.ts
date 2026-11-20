import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@bo/contracts';

export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}
