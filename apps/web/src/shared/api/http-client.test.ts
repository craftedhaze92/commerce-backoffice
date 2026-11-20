import { http as mswHttp, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/shared/testing/msw-server';
import { ApiError } from './api-error';
import {
  defaultSessionExpired,
  http as httpClient,
  refreshOnce,
  setSessionExpiredHandler,
} from './http-client';

const UNAUTH = { statusCode: 401, code: 'UNAUTHORIZED', message: 'expired' };
const noContent = () => new HttpResponse(null, { status: 204 });

// 테스트 순서와 무관하게 기본 핸들러(실제 이동)가 실행되지 않도록 no-op으로 시작한다.
beforeEach(() => setSessionExpiredHandler(() => {}));
afterEach(() => setSessionExpiredHandler(() => {}));

describe('http client', () => {
  it('throws ApiError with server code', async () => {
    server.use(
      mswHttp.get('/api/v1/x', () =>
        HttpResponse.json({ statusCode: 403, code: 'FORBIDDEN', message: 'no' }, { status: 403 }),
      ),
    );
    const err = await httpClient('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'no' });
  });

  it('keeps details from the error body', async () => {
    server.use(
      mswHttp.get('/api/v1/x', () =>
        HttpResponse.json(
          { statusCode: 400, code: 'VALIDATION_FAILED', message: 'bad', details: { f: 1 } },
          { status: 400 },
        ),
      ),
    );
    await expect(httpClient('/x')).rejects.toMatchObject({ details: { f: 1 } });
  });

  it('maps non-JSON error bodies to INTERNAL with the HTTP status', async () => {
    server.use(
      mswHttp.get('/api/v1/x', () => new HttpResponse('<html>boom</html>', { status: 502 })),
    );
    await expect(httpClient('/x')).rejects.toMatchObject({ status: 502, code: 'INTERNAL' });
  });

  it('maps malformed JSON error bodies to INTERNAL', async () => {
    server.use(mswHttp.get('/api/v1/x', () => HttpResponse.json({ foo: 'bar' }, { status: 500 })));
    await expect(httpClient('/x')).rejects.toMatchObject({ status: 500, code: 'INTERNAL' });
  });

  it('maps network failures to ApiError status 0 INTERNAL', async () => {
    server.use(mswHttp.get('/api/v1/x', () => HttpResponse.error()));
    await expect(httpClient('/x')).rejects.toMatchObject({ status: 0, code: 'INTERNAL' });
  });

  it('sends X-Requested-With: fetch and credentials include', async () => {
    let header: string | null = null;
    let credentials: string | undefined;
    server.use(
      mswHttp.get('/api/v1/x', ({ request }) => {
        header = request.headers.get('x-requested-with');
        credentials = request.credentials;
        return HttpResponse.json({ ok: true });
      }),
    );
    await httpClient('/x', { headers: { 'X-Requested-With': 'evil' } });
    expect(header).toBe('fetch');
    expect(credentials).toBe('include');
  });

  it('serializes json bodies with Content-Type', async () => {
    let body: unknown;
    let contentType: string | null = null;
    server.use(
      mswHttp.post('/api/v1/x', async ({ request }) => {
        contentType = request.headers.get('content-type');
        body = await request.json();
        return HttpResponse.json({ ok: true });
      }),
    );
    await httpClient('/x', { method: 'POST', json: { a: 1 } });
    expect(body).toEqual({ a: 1 });
    expect(contentType).toBe('application/json');
  });

  it('maps an empty or non-JSON 2xx body to ApiError INTERNAL', async () => {
    server.use(
      mswHttp.get('/api/v1/x', () => new HttpResponse('', { status: 200 })),
      mswHttp.get('/api/v1/y', () => new HttpResponse('<html>', { status: 200 })),
    );
    await expect(httpClient('/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 200,
      code: 'INTERNAL',
    });
    await expect(httpClient('/y')).rejects.toBeInstanceOf(ApiError);
  });

  it('returns undefined on 204', async () => {
    server.use(mswHttp.delete('/api/v1/x', noContent));
    await expect(httpClient('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });
});

describe('401 refresh', () => {
  it('refreshes once for concurrent 401s and retries all of them', async () => {
    let refreshCalls = 0;
    let authed = false;
    server.use(
      mswHttp.post('/api/v1/auth/refresh', () => {
        refreshCalls++;
        authed = true;
        return noContent();
      }),
      mswHttp.get('/api/v1/a', () =>
        authed ? HttpResponse.json(1) : HttpResponse.json(UNAUTH, { status: 401 }),
      ),
      mswHttp.get('/api/v1/b', () =>
        authed ? HttpResponse.json(2) : HttpResponse.json(UNAUTH, { status: 401 }),
      ),
    );
    await expect(
      Promise.all([httpClient('/a'), httpClient('/b'), httpClient('/a')]),
    ).resolves.toEqual([1, 2, 1]);
    expect(refreshCalls).toBe(1);
  });

  it('refreshes again on a second expiry after a successful refresh', async () => {
    let refreshCalls = 0;
    let authed = false;
    server.use(
      mswHttp.post('/api/v1/auth/refresh', () => {
        refreshCalls++;
        authed = true;
        return noContent();
      }),
      mswHttp.get('/api/v1/a', () =>
        authed ? HttpResponse.json(1) : HttpResponse.json(UNAUTH, { status: 401 }),
      ),
    );
    await expect(httpClient('/a')).resolves.toBe(1);
    authed = false; // Access 재만료
    await expect(httpClient('/a')).resolves.toBe(1);
    expect(refreshCalls).toBe(2);
  });

  it('calls the session-expired handler once and rejects every request when refresh fails', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    server.use(
      mswHttp.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ ...UNAUTH, code: 'TOKEN_REUSED' }, { status: 401 }),
      ),
      mswHttp.get('/api/v1/a', () => HttpResponse.json(UNAUTH, { status: 401 })),
      mswHttp.get('/api/v1/b', () => HttpResponse.json(UNAUTH, { status: 401 })),
    );
    const results = await Promise.allSettled([
      httpClient('/a'),
      httpClient('/b'),
      httpClient('/a'),
    ]);
    for (const r of results) {
      expect(r).toMatchObject({
        status: 'rejected',
        reason: { status: 401, code: 'UNAUTHORIZED' },
      });
    }
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('retries at most once when the retry also returns 401', async () => {
    let aCalls = 0;
    let refreshCalls = 0;
    server.use(
      mswHttp.post('/api/v1/auth/refresh', () => {
        refreshCalls++;
        return noContent();
      }),
      mswHttp.get('/api/v1/a', () => {
        aCalls++;
        return HttpResponse.json(UNAUTH, { status: 401 });
      }),
    );
    await expect(httpClient('/a')).rejects.toMatchObject({ status: 401 });
    expect(aCalls).toBe(2);
    expect(refreshCalls).toBe(1);
  });

  it.each(['/auth/login', '/auth/logout'])(
    'does not try refresh when %s returns 401',
    async (path) => {
      let refreshCalls = 0;
      server.use(
        mswHttp.post('/api/v1/auth/refresh', () => {
          refreshCalls++;
          return noContent();
        }),
        mswHttp.post(`/api/v1${path}`, () =>
          HttpResponse.json({ ...UNAUTH, code: 'INVALID_CREDENTIALS' }, { status: 401 }),
        ),
      );
      await expect(httpClient(path, { method: 'POST' })).rejects.toMatchObject({ status: 401 });
      expect(refreshCalls).toBe(0);
    },
  );

  it('does not recurse when /auth/refresh itself returns 401', async () => {
    let refreshCalls = 0;
    server.use(
      mswHttp.post('/api/v1/auth/refresh', () => {
        refreshCalls++;
        return HttpResponse.json(UNAUTH, { status: 401 });
      }),
    );
    await expect(refreshOnce()).resolves.toBe(false);
    expect(refreshCalls).toBe(1);
  });

  it('treats a network failure during refresh as a failed refresh', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    server.use(
      mswHttp.post('/api/v1/auth/refresh', () => HttpResponse.error()),
      mswHttp.get('/api/v1/a', () => HttpResponse.json(UNAUTH, { status: 401 })),
    );
    await expect(httpClient('/a')).rejects.toMatchObject({ status: 401 });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});

describe('default session-expired handler', () => {
  function stubLocation(pathname: string, search = '') {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      origin: 'http://localhost:3000',
      pathname,
      search,
      assign,
    } as unknown as Location);
    return assign;
  }

  afterEach(() => vi.restoreAllMocks());

  it('redirects to /login with the encoded next path', () => {
    const assign = stubLocation('/orders', '?x=1');
    defaultSessionExpired();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(String(assign.mock.calls[0][0])).toBe(
      'http://localhost:3000/login?next=%2Forders%3Fx%3D1&reason=expired',
    );
  });

  it('does not navigate when already on /login (prevents reload loop)', () => {
    for (const path of ['/login', '/login/reset']) {
      const assign = stubLocation(path);
      defaultSessionExpired();
      expect(assign).not.toHaveBeenCalled();
    }
  });

  it('omits next on /', () => {
    const assign = stubLocation('/');
    defaultSessionExpired();
    expect(String(assign.mock.calls[0][0])).toBe('http://localhost:3000/login?reason=expired');
  });
});
