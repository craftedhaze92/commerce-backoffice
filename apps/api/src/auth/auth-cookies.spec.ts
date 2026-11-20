import type { Response } from 'express';
import type { Env } from '../config/env.js';
import { clearAuthCookies, setAuthCookies } from './auth-cookies.js';

const mockRes = () => {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  return { res, asResponse: res as unknown as Response };
};
const env = (NODE_ENV: Env['NODE_ENV']) => ({ NODE_ENV }) as Env;

describe('auth cookies', () => {
  it.each([
    ['production', true],
    ['development', false],
    ['test', false],
  ] as const)('setAuthCookies with NODE_ENV=%s → secure=%s', (nodeEnv, secure) => {
    const { res, asResponse } = mockRes();
    setAuthCookies(asResponse, 'at', 'rt', env(nodeEnv));
    expect(res.cookie).toHaveBeenCalledWith(
      'bo_at',
      'at',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', secure }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'bo_rt',
      'rt',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
        secure,
      }),
    );
  });

  it.each([
    ['production', true],
    ['development', false],
  ] as const)('clearAuthCookies with NODE_ENV=%s → secure=%s', (nodeEnv, secure) => {
    const { res, asResponse } = mockRes();
    clearAuthCookies(asResponse, env(nodeEnv));
    expect(res.clearCookie).toHaveBeenCalledWith('bo_at', expect.objectContaining({ path: '/', secure }));
    expect(res.clearCookie).toHaveBeenCalledWith(
      'bo_rt',
      expect.objectContaining({ path: '/api/v1/auth', secure }),
    );
  });
});
