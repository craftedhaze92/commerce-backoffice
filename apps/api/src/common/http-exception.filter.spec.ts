import {
  BadRequestException,
  ForbiddenException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { AppException } from './app-exception.js';
import { AllExceptionsFilter } from './http-exception.filter.js';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn((_code: number) => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  const logError = vi.spyOn(Logger.prototype, 'error');
  beforeEach(() => {
    logError.mockReset().mockImplementation(() => undefined);
  });

  it('passes AppException through with details', () => {
    const { status, body } = run(new AppException(409, 'CONFLICT', 'dup', [{ field: 'email' }]));
    expect(status).toBe(409);
    expect(body).toEqual({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'dup',
      details: [{ field: 'email' }],
    });
  });

  it('omits details when absent', () => {
    const { body } = run(new AppException(401, 'INVALID_CREDENTIALS', 'bad'));
    expect(body).toEqual({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'bad' });
  });

  it('maps Nest HttpExceptions by status', () => {
    expect(run(new ForbiddenException()).body).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(run(new BadRequestException(['a', 'b'])).body).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'a, b',
    });
  });

  it('maps exposed body-parser style client errors', () => {
    const err = Object.assign(new SyntaxError('Unexpected token'), { status: 400, expose: true });
    expect(run(err).body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
  });

  it('hides unknown error messages behind 500 INTERNAL', () => {
    const { status, body } = run(new Error('secret db password leaked'));
    expect(status).toBe(500);
    expect(logError).toHaveBeenCalledWith('secret db password leaked', expect.any(String));
    expect(body).toEqual({ statusCode: 500, code: 'INTERNAL', message: 'Internal server error' });
  });
});
