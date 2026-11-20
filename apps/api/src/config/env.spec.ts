import { validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://bo:bo@localhost:5433/bo',
  JWT_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('validateEnv', () => {
  it('throws when JWT_SECRET is missing', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'postgres://x', WEB_ORIGIN: 'http://localhost:3000' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is shorter than 32 chars', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('names every invalid key', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*WEB_ORIGIN/);
  });

  it('applies defaults', () => {
    expect(validateEnv(valid)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      ACCESS_TTL_SEC: 900,
      REFRESH_TTL_SEC: 604800,
    });
  });

  it('coerces numeric strings', () => {
    expect(validateEnv({ ...valid, PORT: '5000' }).PORT).toBe(5000);
  });
});
