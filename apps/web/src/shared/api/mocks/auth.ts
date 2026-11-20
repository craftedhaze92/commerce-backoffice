import { Role, type MeResponse } from '@bo/contracts';
import { http, HttpResponse } from 'msw';

/** 테스트 기본 사용자(viewer) */
export const viewerMe: MeResponse = {
  id: 'user-viewer',
  email: 'viewer@example.com',
  name: 'Viewer',
  role: Role.VIEWER,
};

/** 인증 API 기본 핸들러. 테스트에서 server.use()로 덮어쓴다. */
export const authHandlers = [
  http.get('/api/v1/auth/me', () => HttpResponse.json(viewerMe)),
  http.post('/api/v1/auth/login', () => HttpResponse.json(viewerMe)),
  http.post('/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/v1/auth/refresh', () => new HttpResponse(null, { status: 204 })),
];
