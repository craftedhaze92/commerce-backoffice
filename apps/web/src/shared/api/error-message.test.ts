import { describe, expect, it } from 'vitest';
import { ApiError } from './api-error';
import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('maps each ErrorCode to its default Korean text; unknown/network → generic', () => {
    const generic = '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    expect(errorMessage(new ApiError(400, 'VALIDATION_FAILED', 'x'))).toBe(
      '입력값을 확인해 주세요.',
    );
    expect(errorMessage(new ApiError(401, 'UNAUTHORIZED', 'x'))).toBe('로그인이 필요합니다.');
    expect(errorMessage(new ApiError(403, 'FORBIDDEN', 'x'))).toBe('권한이 없습니다.');
    expect(errorMessage(new ApiError(404, 'NOT_FOUND', 'x'))).toBe('대상을 찾을 수 없습니다.');
    expect(errorMessage(new ApiError(409, 'CONFLICT', 'x'))).toBe(
      '다른 변경과 충돌했습니다. 새로고침 후 다시 시도해 주세요.',
    );
    expect(errorMessage(new ApiError(403, 'DEMO_PROTECTED', 'x'))).toBe(
      '데모 계정은 변경할 수 없습니다.',
    );
    expect(errorMessage(new ApiError(429, 'TOO_MANY_REQUESTS', 'x'))).toBe(
      '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(errorMessage(new ApiError(500, 'INTERNAL', 'raw english'))).toBe(generic);
    expect(errorMessage(new ApiError(0, 'INTERNAL', 'Network error'))).toBe(generic);
    expect(errorMessage(new ApiError(422, 'INSUFFICIENT_STOCK', 'x'))).toBe(generic);
    expect(errorMessage(new Error('boom'))).toBe(generic);
    expect(errorMessage(undefined)).toBe(generic);
  });

  it('never leaks the server message', () => {
    expect(errorMessage(new ApiError(403, 'FORBIDDEN', 'Insufficient role'))).not.toContain(
      'Insufficient',
    );
  });

  it('CONFLICT with details.reason LAST_ADMIN uses override for reason first', () => {
    const err = new ApiError(409, 'CONFLICT', 'x', { reason: 'LAST_ADMIN' });
    expect(errorMessage(err, { LAST_ADMIN: '마지막 관리자', CONFLICT: '일반 충돌' })).toBe(
      '마지막 관리자',
    );
    expect(errorMessage(err, { CONFLICT: '일반 충돌' })).toBe('일반 충돌');
    expect(errorMessage(err)).toBe('다른 변경과 충돌했습니다. 새로고침 후 다시 시도해 주세요.');
  });

  it('code overrides apply to non-conflict codes', () => {
    expect(errorMessage(new ApiError(404, 'NOT_FOUND', 'x'), { NOT_FOUND: '없음' })).toBe('없음');
  });
});
