import type { ConflictReason, ErrorCode } from '@bo/contracts';
import { ApiError } from './api-error';

export type ErrorMessageOverrides = Partial<Record<ErrorCode | ConflictReason, string>>;

const GENERIC = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: '입력값을 확인해 주세요.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',
  NOT_FOUND: '대상을 찾을 수 없습니다.',
  CONFLICT: '다른 변경과 충돌했습니다. 새로고침 후 다시 시도해 주세요.',
  DEMO_PROTECTED: '데모 계정은 변경할 수 없습니다.',
  TOO_MANY_REQUESTS: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
};

function conflictReason(details: unknown): string | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const reason = (details as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : undefined;
}

/**
 * 화면에 보일 한국어 문구를 에러 코드로 정한다. 서버의 `message`(영어, 개발자용)는 쓰지 않는다.
 * CONFLICT는 `details.reason`의 override를 먼저 보고, 그다음 코드의 override, 기본 문구 순이다.
 */
export function errorMessage(err: unknown, overrides: ErrorMessageOverrides = {}): string {
  if (!(err instanceof ApiError)) return overrides.INTERNAL ?? GENERIC;
  if (err.code === 'CONFLICT') {
    const reason = conflictReason(err.details);
    const byReason = reason ? overrides[reason as ConflictReason] : undefined;
    if (byReason) return byReason;
  }
  return overrides[err.code] ?? DEFAULT_MESSAGES[err.code] ?? GENERIC;
}
