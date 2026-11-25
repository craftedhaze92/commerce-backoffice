import { validateEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://bo:bo@localhost:5433/bo',
  JWT_SECRET: 'x'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
  S3_ACCESS_KEY_ID: 'local',
  S3_SECRET_ACCESS_KEY: 'local',
};

describe('validateEnv', () => {
  it('throws when JWT_SECRET is missing', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: undefined })).toThrow(/JWT_SECRET/);
  });

  it('throws when JWT_SECRET is shorter than 32 chars', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('rejects the .env.example JWT_SECRET placeholder in production', () => {
    const placeholder = 'change-me-to-a-random-string-of-32-chars-or-more';
    expect(() =>
      validateEnv({ ...valid, NODE_ENV: 'production', JWT_SECRET: placeholder }),
    ).toThrow(/JWT_SECRET/);
    expect(validateEnv({ ...valid, JWT_SECRET: placeholder }).JWT_SECRET).toBe(placeholder);
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

  it('applies S3 defaults and parses the path-style flag', () => {
    expect(validateEnv(valid)).toMatchObject({
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'bo-media',
      S3_FORCE_PATH_STYLE: true,
    });
    expect(validateEnv(valid).S3_ENDPOINT).toBeUndefined();
    expect(validateEnv({ ...valid, S3_FORCE_PATH_STYLE: 'false', S3_ENDPOINT: '' })).toMatchObject({
      S3_FORCE_PATH_STYLE: false,
    });
  });

  it('requires S3 credentials', () => {
    expect(() =>
      validateEnv({ ...valid, S3_ACCESS_KEY_ID: undefined, S3_SECRET_ACCESS_KEY: undefined }),
    ).toThrow(/S3_ACCESS_KEY_ID[\s\S]*S3_SECRET_ACCESS_KEY/);
  });

  it('coerces numeric strings', () => {
    expect(validateEnv({ ...valid, PORT: '5000' }).PORT).toBe(5000);
  });

  it('DEMO_MODE defaults to false and parses "true"', () => {
    expect(validateEnv(valid).DEMO_MODE).toBe(false);
    expect(validateEnv({ ...valid, DEMO_MODE: 'true' }).DEMO_MODE).toBe(true);
    expect(validateEnv({ ...valid, DEMO_MODE: 'false' }).DEMO_MODE).toBe(false);
    expect(() => validateEnv({ ...valid, DEMO_MODE: 'yes' })).toThrow(/DEMO_MODE/);
  });
});
