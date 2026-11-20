import type { Response } from 'express';
import { API_PREFIX } from '../common/api-prefix.js';
import type { Env } from '../config/env.js';

export const ACCESS_COOKIE = 'bo_at';
export const REFRESH_COOKIE = 'bo_rt';
export const REFRESH_PATH = `/${API_PREFIX}/auth`;
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function setAuthCookies(res: Response, access: string, refreshRaw: string, env: Env): void {
  const secure = env.NODE_ENV === 'production';
  res.cookie(ACCESS_COOKIE, access, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
    secure,
  });
  res.cookie(REFRESH_COOKIE, refreshRaw, {
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_PATH,
    maxAge: COOKIE_MAX_AGE_MS,
    secure,
  });
}

export function clearAuthCookies(res: Response, env: Env): void {
  const secure = env.NODE_ENV === 'production';
  res.clearCookie(ACCESS_COOKIE, { httpOnly: true, sameSite: 'lax', path: '/', secure });
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_PATH,
    secure,
  });
}
