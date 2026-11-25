import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@bo/contracts';
import type { Response } from 'express';
import { AppException } from './app-exception.js';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

function messageOf(response: string | object, fallback: string): string {
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' ? message : fallback;
}

/** Whether `err` is a client error raised outside Nest (e.g. body-parser's malformed JSON). */
function isExposedClientError(err: unknown): err is Error & { status: number } {
  const e = err as { status?: unknown; expose?: unknown };
  return (
    err instanceof Error &&
    typeof e.status === 'number' &&
    e.status >= 400 &&
    e.status < 500 &&
    e.expose === true
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toBody(exception);
    host.switchToHttp().getResponse<Response>().status(body.statusCode).json(body);
  }

  /** Any 4xx keeps its real status; unlisted ones (413, 405, ...) fall back to VALIDATION_FAILED. */
  private clientError(status: number, message: string): ApiErrorBody {
    const code = STATUS_TO_CODE[status];
    if (!code) this.logger.warn(`Unmapped ${status} client error: ${message}`);
    return { statusCode: status, code: code ?? 'VALIDATION_FAILED', message };
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof AppException) {
      const body: ApiErrorBody = {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
      };
      if (exception.details !== undefined) body.details = exception.details;
      return body;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = messageOf(exception.getResponse(), exception.message);
      if (status >= 400 && status < 500) return this.clientError(status, message);
    } else if (isExposedClientError(exception)) {
      return this.clientError(exception.status, exception.message);
    }

    // Anything else is a server fault: log the original, never leak it to the client.
    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    return { statusCode: 500, code: 'INTERNAL', message: 'Internal server error' };
  }
}
