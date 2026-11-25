import { z } from 'zod';

/** `.env.example`에 적힌 예시 값. 공개 저장소에 있으므로 production에서 쓰면 토큰을 누구나 위조할 수 있다. */
const EXAMPLE_JWT_SECRET = 'change-me-to-a-random-string-of-32-chars-or-more';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900),
    REFRESH_TTL_SEC: z.coerce.number().int().positive().default(604800),
    WEB_ORIGIN: z.string().min(1),
    S3_ENDPOINT: z
      .string()
      .optional()
      .transform((v) => (v ? v : undefined)),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1).default('bo-media'),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    /** 공개 데모 배포용. true면 시드 데모 계정의 역할·활성 상태 변경을 막는다. */
    DEMO_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Express `trust proxy` 홉 수. 0이면 설정하지 않아 X-Forwarded-For를 믿지 않는다. */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    /** POST /auth/login 시도 제한: (IP, 정규화한 이메일)마다 TTL 동안 허용하는 횟수. */
    LOGIN_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),
    LOGIN_THROTTLE_TTL_SEC: z.coerce.number().int().positive().default(600),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === EXAMPLE_JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'must not be the .env.example placeholder in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Parses raw env vars; throws an Error naming every missing/invalid key. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables: ${problems}`);
  }
  return result.data;
}
