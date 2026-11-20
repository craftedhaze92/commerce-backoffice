import type { ApiErrorBody, ErrorCode } from '@bo/contracts';

/**
 * API 오류를 정규화한 에러.
 *
 * 서버가 준 `ApiErrorBody`를 그대로 옮기고, 본문이 없거나 형식이 다르면
 * code `INTERNAL`에 HTTP 상태를 담는다. 네트워크 실패(fetch reject)는 status 0이다.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static fromBody(status: number, body: ApiErrorBody): ApiError {
    return new ApiError(status, body.code, body.message, body.details);
  }
}
