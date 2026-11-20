import request from 'supertest';
import { createTestApp, type TestApp } from './setup-app.js';

describe('health & error format (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('GET /api/v1/health → 200 { status: "ok", db: "up" }', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('unknown route → 404 ApiErrorBody', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: expect.any(String),
    });
  });

  it('validation error → 400 VALIDATION_FAILED with details', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'fetch')
      .send({ email: 'nope', password: '', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details).toEqual(
      expect.arrayContaining([{ field: 'email', messages: expect.any(Array) }]),
    );
  });
});
