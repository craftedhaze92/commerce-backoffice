# M0 기반 + M1 인증·권한 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모노레포에서 Nest API와 Next 어드민 셸을 띄우고, 로그인·토큰 갱신·로그아웃과 3단계 RBAC가 서버와 화면 양쪽에서 동작하게 만든다.

**Architecture:** pnpm workspace에 `apps/api`(NestJS + TypeORM + PostgreSQL), `apps/web`(Next.js 16, 물타기 FSD 구조·UI 이식), `packages/contracts`(공유 enum·타입·권한 맵)를 둔다. 브라우저는 Next의 `/api/*` rewrite를 거쳐 Nest를 같은 출처로 호출한다. 인증은 httpOnly 쿠키에 담은 Access JWT와, DB에 해시로 저장하고 매번 교체하는 Refresh Token으로 한다.

**Tech Stack:** pnpm, TypeScript strict, NestJS 11, TypeORM 0.3, PostgreSQL 16, passport-jwt, argon2, Jest + Supertest + @testcontainers/postgresql, Next.js 16, TanStack Query v5, Zustand, Shadcn UI + Tailwind v4, react-hook-form + zod, Vitest + RTL + MSW, tsup

**Spec:** `docs/2026-11-20-commerce-backoffice-design.md` (§3 스택, §4 연결 방식, §7 인증·권한, §8 API 규약, §11 프론트, §12 품질)

**이후 계획(별도 문서로 작성):** M2 상품·이미지 → M3 주문·트랜잭션 → M4 대시보드 → M5 엑셀 → M6 마무리·배포

## Global Constraints

- 패키지 매니저는 **pnpm만** 쓴다 (npm·yarn 금지). TypeScript는 모든 패키지에서 `strict: true`.
- 저장소 루트 이름은 `commerce-backoffice`(이름 미정, 나중에 바꿈). 워크스페이스 패키지 스코프는 `@bo/*`.
- API 접두사: `/api/v1`. Swagger: `/api/docs`.
- 에러 응답 형태: `{ "statusCode": number, "code": ErrorCode, "message": string, "details"?: unknown }`.
- 목록 응답 형태: `{ items: T[], meta: { page, size, total, totalPages } }` (M1에서는 `GET /users`만 사용).
- 쿠키 이름: Access `bo_at`, Refresh `bo_rt`.
  - `bo_at`: httpOnly, `SameSite=Lax`, `Path=/`, 쿠키 Max-Age 7일, JWT `exp` 15분, payload `{ sub, role }`.
  - `bo_rt`: httpOnly, `SameSite=Strict`, `Path=/api/v1/auth`, Max-Age 7일.
  - `Secure`는 `NODE_ENV=production`일 때만 붙인다.
- 상태를 바꾸는 요청(POST·PATCH·PUT·DELETE)은 `X-Requested-With: fetch` 헤더가 필요하다. 없으면 403 `CSRF_REQUIRED`.
- 비밀번호 해시는 argon2id.
- 역할 계층: `ADMIN(3) ⊃ MANAGER(2) ⊃ VIEWER(1)`.
- TypeORM `synchronize: false`. 스키마는 마이그레이션으로만 바꾼다.
- 프론트는 물타기의 FSD 규칙(`app → views → widgets → features → entities → shared`, 슬라이스는 `index.ts`로만 노출)과 네이밍 규칙을 따른다. 위반을 `eslint-disable`로 우회하지 않는다.
- 커밋: Conventional Commits, `<type>:` 뒤 제목과 본문은 한글, 제목 끝에 마침표 없음.
- 완료 보고 전: 루트에서 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`가 통과해야 한다.
- 물타기 원본 경로: `/Users/dohyun/문서/GitHub/mool-ta-gi` (이하 `$MTG`).

## Review Focus

1. **동시에 여러 요청이 401을 받는 경우**: 대시보드처럼 한 화면이 API를 여러 개 동시에 부르다 Access가 만료되면, refresh는 한 번만 호출되고 실패했던 요청은 모두 재시도돼야 한다. → Task 8 `refreshes once for concurrent 401s`
2. **`next` 파라미터를 악용한 외부 이동**: `/login?next=https://evil.com`이나 `//evil.com`이 들어와도 로그인 후 앱 안쪽(`/dashboard`)으로만 가야 한다. → Task 9 `sanitizeNext`
3. **비활성화된 사용자의 아직 유효한 JWT**: JWT 만료 전이라도 `isActive=false`면 즉시 401이어야 한다. → Task 6 `rejects deactivated user with valid access token`
4. **이메일 대소문자·공백**: `Admin@Demo.com`으로도 `admin@demo.com` 계정에 로그인돼야 한다. 반대로 없는 이메일과 틀린 비밀번호는 같은 응답을 받아 계정 존재 여부가 드러나지 않아야 한다. → Task 4
5. **필수 환경변수 누락**: `JWT_SECRET`이 없거나 32자 미만이면 서버가 기본값으로 뜨지 말고 부팅 단계에서 실패해야 한다. → Task 2 `validateEnv`

---

## File Structure

```
commerce-backoffice/
├── package.json                 루트 스크립트 (dev·lint·typecheck·test·build, 각 앱 위임)
├── pnpm-workspace.yaml          apps/*, packages/*
├── tsconfig.base.json           공통 strict 옵션
├── .prettierrc.json             $MTG에서 복사
├── docker-compose.yml           postgres:16-alpine (5432), minio (M2에서 사용, 지금 정의만)
├── .env.example                 api·web 환경변수 목록
├── .github/workflows/ci.yml
├── packages/contracts/
│   ├── package.json             tsup으로 cjs+esm+d.ts 빌드
│   └── src/
│       ├── role.ts              Role, ROLE_RANK, hasRole
│       ├── permission.ts        Permission, ROLE_PERMISSIONS, can
│       ├── api.ts               ErrorCode, ApiErrorBody, Paginated<T>, PageMeta
│       ├── auth.ts              MeResponse, LoginRequest
│       ├── index.ts
│       └── *.test.ts
├── apps/api/
│   ├── src/
│   │   ├── main.ts              bootstrap: prefix, cookie-parser, ValidationPipe, Swagger
│   │   ├── app.module.ts
│   │   ├── config/env.ts        validateEnv (zod) · Env 타입
│   │   ├── database/
│   │   │   ├── data-source.ts   TypeORM CLI·앱 공용 DataSourceOptions
│   │   │   ├── migrations/
│   │   │   └── seed.ts          데모 계정 3개
│   │   ├── common/
│   │   │   ├── app-exception.ts         AppException(code, status, message, details)
│   │   │   ├── http-exception.filter.ts 모든 예외 → ApiErrorBody
│   │   │   └── csrf.guard.ts
│   │   ├── health/health.controller.ts
│   │   ├── users/  user.entity.ts · users.service.ts · users.controller.ts · users.module.ts · dto/
│   │   └── auth/
│   │       ├── auth.module.ts · auth.controller.ts · auth.service.ts
│   │       ├── refresh-token.entity.ts · refresh-token.service.ts
│   │       ├── password.ts      hashPassword · verifyPassword
│   │       ├── auth-cookies.ts  setAuthCookies · clearAuthCookies
│   │       ├── jwt.strategy.ts · jwt-auth.guard.ts · roles.guard.ts
│   │       └── decorators.ts    @Public() · @Roles() · @CurrentUser()
│   └── test/
│       ├── jest-e2e.json
│       ├── setup-app.ts         Testcontainers PG + 마이그레이션 + 앱 생성
│       └── *.e2e-spec.ts
└── apps/web/
    ├── next.config.ts           rewrites /api/:path* → API_ORIGIN, transpile 없음(contracts는 빌드 산출물)
    ├── proxy.ts                 세션 쿠키 없으면 /login?next= 로
    ├── app/
    │   ├── layout.tsx · globals.css
    │   ├── (auth)/login/page.tsx
    │   ├── (admin)/layout.tsx · (admin)/dashboard/page.tsx · (admin)/users/page.tsx
    │   └── forbidden/page.tsx
    └── src/
        ├── shared/ui/*          $MTG에서 이식
        ├── shared/api/  http-client.ts · api-error.ts · query-provider.tsx · mocks/auth.ts
        ├── shared/lib/  utils.ts · sanitize-next.ts
        ├── shared/testing/  render-with-query.tsx · msw-server.ts
        ├── entities/session/  model/use-me.ts · model/query-keys.ts · ui/can.tsx · index.ts
        ├── features/auth-login/  ui/login-form.tsx · model/login-schema.ts · index.ts
        ├── features/auth-logout/ ui/logout-button.tsx · index.ts
        ├── widgets/admin-sidebar/ ui/admin-sidebar.tsx · lib/menu.ts · index.ts
        └── views/  login/ · dashboard/ · users/ · forbidden/
```

---

### Task 1: 모노레포·인프라·contracts 패키지

**Files:**

- Create: 루트 `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.prettierrc.json`(`$MTG/.prettierrc.json` 복사), `.gitignore`, `docker-compose.yml`, `.env.example`
- Create: `packages/contracts/{package.json,tsconfig.json,tsup.config.ts,vitest.config.ts}`, `src/{role,permission,api,auth,index}.ts`
- Test: `packages/contracts/src/role.test.ts`, `packages/contracts/src/permission.test.ts`

**Interfaces:**

- Produces (`@bo/contracts`):
  - `enum Role { ADMIN='ADMIN', MANAGER='MANAGER', VIEWER='VIEWER' }`, `ROLE_RANK: Record<Role, number>`
  - `hasRole(actual: Role, required: Role): boolean`
  - `type Permission = 'dashboard:read'|'product:read'|'product:write'|'inventory:adjust'|'order:read'|'order:write'|'export:download'|'user:manage'`
  - `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>`, `can(role: Role, permission: Permission): boolean`
  - `type ErrorCode = 'VALIDATION_FAILED'|'UNAUTHORIZED'|'INVALID_CREDENTIALS'|'TOKEN_REUSED'|'FORBIDDEN'|'CSRF_REQUIRED'|'NOT_FOUND'|'CONFLICT'|'INTERNAL'`
  - `interface ApiErrorBody { statusCode: number; code: ErrorCode; message: string; details?: unknown }`
  - `interface PageMeta { page: number; size: number; total: number; totalPages: number }`, `interface Paginated<T> { items: T[]; meta: PageMeta }`
  - `interface MeResponse { id: string; email: string; name: string; role: Role }`, `interface LoginRequest { email: string; password: string }`
  - `interface UserListItem extends MeResponse { isActive: boolean; createdAt: string /* ISO */ }`

- [ ] **Step 1: 루트 워크스페이스 파일 작성.** `pnpm-workspace.yaml`은 `apps/*`, `packages/*`로 하고 `ignoredBuiltDependencies`는 `$MTG`와 같게 둔다. 루트 `package.json` 스크립트는 `"build": "pnpm -r build"`, `"lint" / "typecheck" / "test"`(모두 `pnpm -r`), `"dev": "pnpm --filter @bo/contracts build && pnpm -r --parallel dev"`, `"db:up": "docker compose up -d"`. `docker-compose.yml`에는 `postgres:16-alpine`(DB `bo`, 사용자·비밀번호 `bo`/`bo`, 포트 5432, named volume)와 `minio/minio`(9000·9001, 지금은 정의만)를 둔다.

- [ ] **Step 2: 실패하는 테스트 작성**

```ts
// role.test.ts
it('hasRole follows hierarchy', () => {
  expect(hasRole(Role.ADMIN, Role.MANAGER)).toBe(true);
  expect(hasRole(Role.MANAGER, Role.MANAGER)).toBe(true);
  expect(hasRole(Role.VIEWER, Role.MANAGER)).toBe(false);
});
// permission.test.ts — 설계 §7.2 표 그대로
it.each([
  [Role.VIEWER, 'product:read', true],
  [Role.VIEWER, 'product:write', false],
  [Role.VIEWER, 'export:download', false],
  [Role.MANAGER, 'order:write', true],
  [Role.MANAGER, 'user:manage', false],
  [Role.ADMIN, 'user:manage', true],
])('can(%s, %s) = %s', (role, perm, expected) =>
  expect(can(role, perm as Permission)).toBe(expected),
);
```

- [ ] **Step 3: 실패 확인.** `pnpm --filter @bo/contracts test` → FAIL (모듈 없음)
- [ ] **Step 4: Interfaces 구현.** VIEWER = `dashboard:read, product:read, order:read`, MANAGER = VIEWER + `product:write, inventory:adjust, order:write, export:download`, ADMIN = MANAGER + `user:manage`. tsup은 `format: ['cjs','esm'], dts: true`로 하고, `package.json`의 `exports`에 `import`/`require`/`types`를 모두 연다.
- [ ] **Step 5: 통과 확인.** `pnpm --filter @bo/contracts test && pnpm --filter @bo/contracts build` → PASS, `dist/index.{js,cjs,d.ts}` 생성
- [ ] **Step 6: 인프라 확인.** `docker compose up -d postgres && docker compose ps` → postgres `healthy`(healthcheck `pg_isready`)
- [ ] **Step 7: 커밋.** `git init` 후 `chore: pnpm 모노레포와 contracts 패키지 구성`

---

### Task 2: Nest 앱 기반 — 환경변수·DB 연결·에러 필터·e2e 하네스

**Files:**

- Create: `apps/api/` (`pnpm dlx @nestjs/cli new api --package-manager pnpm --skip-git`로 생성한 뒤 예제 컨트롤러는 삭제), `src/config/env.ts`, `src/database/data-source.ts`, `src/common/app-exception.ts`, `src/common/http-exception.filter.ts`, `src/health/health.controller.ts`, `test/jest-e2e.json`, `test/setup-app.ts`
- Modify: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
- Test: `apps/api/src/config/env.spec.ts`, `apps/api/test/health.e2e-spec.ts`

**Interfaces:**

- Consumes: `ErrorCode`, `ApiErrorBody` (Task 1)
- Produces:
  - `validateEnv(raw: Record<string, unknown>): Env`. `Env = { NODE_ENV: 'development'|'test'|'production'; PORT: number; DATABASE_URL: string; JWT_SECRET: string /* min 32 */; ACCESS_TTL_SEC: number /* 900 */; REFRESH_TTL_SEC: number /* 604800 */; WEB_ORIGIN: string }`. 실패하면 누락·잘못된 키 이름을 담아 throw한다.
  - `class AppException extends HttpException { constructor(status: number, code: ErrorCode, message: string, details?: unknown) }`
  - `buildDataSourceOptions(env: Env): DataSourceOptions`. migrations 경로 `dist/database/migrations/*.js`, `synchronize: false`.
  - `configureApp(app: INestApplication, env: Env): void`. prefix·pipe·filter·cookie-parser·guard 등록. **main.ts와 e2e가 같은 함수를 쓴다.**
  - `createTestApp(): Promise<{ app: INestApplication; dataSource: DataSource; stop(): Promise<void> }>` (test/setup-app.ts). PostgreSqlContainer(`postgres:16-alpine`)를 띄우고 마이그레이션을 실행한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// env.spec.ts
it('throws when JWT_SECRET is missing', () => {
  expect(() => validateEnv({ DATABASE_URL: 'postgres://x', WEB_ORIGIN: 'http://localhost:3000' })).toThrow(/JWT_SECRET/);
});
it('throws when JWT_SECRET is shorter than 32 chars', () => {
  expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
});
it('applies defaults', () => {
  expect(validateEnv(valid)).toMatchObject({ PORT: 4000, ACCESS_TTL_SEC: 900, REFRESH_TTL_SEC: 604800 });
});
// health.e2e-spec.ts
it('GET /api/v1/health → 200 { status: "ok", db: "up" }', ...);
it('unknown route → 404 ApiErrorBody', async () => {
  const res = await request(app.getHttpServer()).get('/api/v1/nope');
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ statusCode: 404, code: 'NOT_FOUND', message: expect.any(String) });
});
it('validation error → 400 VALIDATION_FAILED with details', ...); // Task 4 로그인 DTO로 검증. 여기서는 skip 표시 후 Task 4에서 활성화
```

- [ ] **Step 2: 실패 확인.** `pnpm --filter api test env && pnpm --filter api test:e2e` → FAIL
- [ ] **Step 3: 구현.** env 검증은 zod로 한다(물타기 스택과 맞춤). 필터는 `AppException`이면 그대로, Nest 기본 `HttpException`이면 status를 보고 code를 매핑(400→`VALIDATION_FAILED`, 401→`UNAUTHORIZED`, 403→`FORBIDDEN`, 404→`NOT_FOUND`, 409→`CONFLICT`), 그 밖은 500 `INTERNAL`로 바꾼다. 500일 때 원문 메시지는 숨기고 로그에만 남긴다. `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`의 `exceptionFactory`에서 필드별 에러를 `details`로 넘긴다. health는 `dataSource.query('SELECT 1')`로 DB를 확인한다. 로깅은 `nestjs-pino`를 쓴다. development에서는 pino-pretty로, test에서는 `level: 'silent'`로 출력한다. `Cookie`·`Set-Cookie`·`Authorization` 헤더는 로그에 남기지 않도록 redact한다. `jest-e2e.json`의 `testTimeout`은 120000이다.
- [ ] **Step 4: 통과 확인.** 같은 명령 → PASS
- [ ] **Step 5: 커밋.** `feat: Nest API 기반과 공통 에러 응답 형식 추가`

---

### Task 3: User 엔티티·비밀번호 해시·시드

**Files:**

- Create: `src/users/user.entity.ts`, `src/users/users.service.ts`, `src/users/users.module.ts`, `src/auth/password.ts`, `src/database/migrations/<ts>-CreateUsers.ts`, `src/database/seed.ts`
- Modify: `apps/api/package.json` 스크립트 `db:migrate`(`typeorm migration:run -d dist/database/data-source.js`), `db:seed`
- Test: `src/auth/password.spec.ts`, `test/users.e2e-spec.ts`

**Interfaces:**

- Produces:
  - `User` 엔티티 (`users` 테이블). `id uuid PK`, `email varchar unique`(항상 소문자로 저장), `passwordHash`, `name`, `role enum(Role)` 기본 VIEWER, `isActive boolean` 기본 true, `createdAt`, `updatedAt`
  - `hashPassword(plain: string): Promise<string>`, `verifyPassword(hash: string, plain: string): Promise<boolean>`
  - `normalizeEmail(raw: string): string`. trim 후 소문자.
  - `UsersService.findByEmail(email: string): Promise<User | null>`(내부에서 normalize), `findById(id: string): Promise<User | null>`, `list(page: number, size: number): Promise<Paginated<UserListItem>>` (`createdAt DESC` 정렬)
  - 시드 계정: `admin@demo.com`/ADMIN, `manager@demo.com`/MANAGER, `viewer@demo.com`/VIEWER. 비밀번호는 `.env`의 `SEED_PASSWORD`(예시값 `.env.example`에 기록). 다시 실행해도 중복이 생기지 않는다(upsert).

- [ ] **Step 1: 실패하는 테스트**

```ts
it('verifyPassword true for correct, false for wrong', async () => {
  const h = await hashPassword('pa55word!');
  expect(h.startsWith('$argon2id$')).toBe(true);
  expect(await verifyPassword(h, 'pa55word!')).toBe(true);
  expect(await verifyPassword(h, 'nope')).toBe(false);
});
it('normalizeEmail trims and lowercases', () => expect(normalizeEmail('  Admin@Demo.COM ')).toBe('admin@demo.com'));
// users.e2e-spec.ts
it('findByEmail is case-insensitive via normalize', ...);
it('email unique violation', ...); // 같은 이메일 두 번 insert → QueryFailedError 23505
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현.** 엔티티를 만들고 `migration:generate`로 마이그레이션을 생성한 뒤 내용을 검토하고 커밋한다.
- [ ] **Step 4: 통과 확인.** `pnpm --filter api test && pnpm --filter api test:e2e` → PASS. 이어서 `pnpm --filter api build && pnpm --filter api db:migrate && pnpm --filter api db:seed`를 **두 번** 실행해도 `users`가 3행이어야 한다.
- [ ] **Step 5: 커밋.** `feat: 사용자 엔티티와 데모 계정 시드 추가`

---

### Task 4: 로그인 · me · 로그아웃

**Files:**

- Create: `src/auth/{auth.module,auth.controller,auth.service,auth-cookies,jwt.strategy,jwt-auth.guard,decorators}.ts`, `src/auth/refresh-token.entity.ts`, `src/auth/refresh-token.service.ts`, `src/auth/dto/login.dto.ts`, 마이그레이션 `CreateRefreshTokens`
- Modify: `app.module.ts`(JwtAuthGuard를 `APP_GUARD`로 등록), `health.controller.ts`(`@Public()`)
- Test: `test/auth.e2e-spec.ts`

**Interfaces:**

- Consumes: `UsersService`, `verifyPassword`, `normalizeEmail` (Task 3), `MeResponse` (Task 1), `Env`
- Produces:
  - `RefreshToken` 엔티티: `id uuid`, `userId`, `tokenHash`(sha256 hex), `familyId uuid`, `expiresAt`, `revokedAt nullable`, `replacedById nullable`
  - `RefreshTokenService.issue(userId: string, familyId?: string): Promise<{ raw: string; record: RefreshToken }>`. raw는 32바이트 랜덤 값의 base64url.
  - `setAuthCookies(res: Response, access: string, refreshRaw: string, env: Env): void`, `clearAuthCookies(res: Response, env: Env): void`. 쿠키 속성은 Global Constraints 그대로.
  - 데코레이터: `@Public()`, `@Roles(role: Role)`, `@CurrentUser(): AuthUser`. `type AuthUser = { id: string; role: Role }`
  - 엔드포인트: `POST /auth/login`(Public) → 200 `MeResponse` + 쿠키 두 개 / `GET /auth/me` → `MeResponse` / `POST /auth/logout`(Public, refresh 쿠키가 있으면 그 family를 폐기) → 204 + 쿠키 삭제
  - JwtStrategy는 `bo_at` 쿠키에서 토큰을 꺼낸다. 검증 후 **매 요청 `findById`로 사용자를 다시 읽고**, 없거나 `isActive=false`면 401을 던진다. role도 DB 값을 쓴다(역할 변경 즉시 반영).

- [ ] **Step 1: 실패하는 테스트 (`auth.e2e-spec.ts`)**

```ts
it('login sets bo_at and bo_rt cookies with spec attributes', async () => {
  const res = await login('admin@demo.com', PW);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ id: expect.any(String), email: 'admin@demo.com', name: expect.any(String), role: 'ADMIN' });
  const [at, rt] = pickCookies(res, ['bo_at', 'bo_rt']);
  expect(at).toMatch(/HttpOnly/); expect(at).toMatch(/Path=\//); expect(at).toMatch(/SameSite=Lax/);
  expect(rt).toMatch(/HttpOnly/); expect(rt).toMatch(/Path=\/api\/v1\/auth/); expect(rt).toMatch(/SameSite=Strict/);
});
it('login normalizes email', async () => expect((await login('  Admin@Demo.com ', PW)).status).toBe(200));
it('wrong password and unknown email return identical 401 INVALID_CREDENTIALS', async () => {
  const a = await login('admin@demo.com', 'wrong'); const b = await login('ghost@demo.com', 'wrong');
  expect(a.status).toBe(401); expect(a.body).toEqual(b.body); expect(a.body.code).toBe('INVALID_CREDENTIALS');
});
it('login with invalid body → 400 VALIDATION_FAILED with details', ...); // email 형식 아님, password 빈 값
it('GET /auth/me without cookie → 401 UNAUTHORIZED', ...);
it('GET /auth/me with cookie → MeResponse', ...);
it('logout revokes refresh family and clears cookies', ...); // 이후 POST /auth/refresh(Task 5) → 401. Task 5에서 활성화
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현.** 없는 이메일일 때도 더미 해시에 `verifyPassword`를 한 번 돌려 응답 시간 차이를 줄인다. Access JWT는 `@nestjs/jwt`로 `expiresIn: env.ACCESS_TTL_SEC`. 이 Task의 테스트 요청에는 `X-Requested-With: fetch`를 항상 붙인다(Task 6에서 강제).
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋.** `feat: JWT 쿠키 기반 로그인·로그아웃 API 추가`

---

### Task 5: Refresh Token Rotation과 재사용 탐지

**Files:**

- Modify: `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/refresh-token.service.ts`
- Test: `test/auth-refresh.e2e-spec.ts`

**Interfaces:**

- Consumes: Task 4의 `RefreshTokenService`, `setAuthCookies`
- Produces:
  - `RefreshTokenService.rotate(raw: string): Promise<{ userId: string; next: { raw: string } }>`. 실패하면 `AppException(401, 'UNAUTHORIZED' | 'TOKEN_REUSED')`.
  - `RefreshTokenService.revokeFamily(familyId: string): Promise<void>`, `revokeAllForUser(userId: string): Promise<void>`
  - 엔드포인트 `POST /auth/refresh`(Public): `bo_rt` 쿠키로 갱신 → 204 + 새 쿠키 두 개

- [ ] **Step 1: 실패하는 테스트**

```ts
it('refresh issues new cookies and old refresh becomes invalid', ...);
it('reusing an already-rotated refresh → 401 TOKEN_REUSED and revokes the whole family', async () => {
  const rt1 = await loginAndGetRt();
  const rt2 = await refresh(rt1);            // 정상 회전
  const reuse = await refreshRaw(rt1);       // 탈취된 옛 토큰 재사용
  expect(reuse.status).toBe(401); expect(reuse.body.code).toBe('TOKEN_REUSED');
  expect((await refreshRaw(rt2)).status).toBe(401); // 정상 사용자 토큰도 폐기됨
});
it('expired refresh → 401 UNAUTHORIZED', ...); // expiresAt을 과거로 직접 UPDATE
it('refresh for deactivated user → 401', ...);
it('logout revokes refresh family and clears cookies', ...); // Task 4에서 미뤄둔 테스트 활성화
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현.** 회전은 트랜잭션 하나로 처리한다. 기존 레코드를 `pessimistic_write`로 잠그고 `revokedAt`·`replacedById`를 설정한 뒤 새 레코드를 insert한다. 이미 `revokedAt`이 있으면 `revokeFamily` 후 `TOKEN_REUSED`를 던진다.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋.** `feat: 리프레시 토큰 회전과 재사용 탐지 추가`

---

### Task 6: RBAC Guard · CSRF Guard · 사용자 목록 API

**Files:**

- Create: `src/auth/roles.guard.ts`, `src/common/csrf.guard.ts`, `src/users/users.controller.ts`, `src/users/dto/list-users.query.ts`
- Modify: `app.module.ts` (전역 가드 순서: Csrf → JwtAuth → Roles), `main.ts` Swagger 설정 (`addCookieAuth('bo_at')`)
- Test: `test/rbac.e2e-spec.ts`

**Interfaces:**

- Consumes: `hasRole` (Task 1), `@Roles`, `AuthUser` (Task 4), `UsersService.list` (Task 3)
- Produces:
  - `RolesGuard`: `@Roles(required)` 메타데이터가 없으면 통과, 있으면 `hasRole(user.role, required)`. 실패하면 403 `FORBIDDEN`.
  - `CsrfGuard`: 메서드가 GET·HEAD·OPTIONS가 아니면 `x-requested-with === 'fetch'`를 확인한다. 실패하면 403 `CSRF_REQUIRED`. `@Public()` 라우트(login 포함)에도 적용한다.
  - `GET /users?page=1&size=20` → `@Roles(Role.ADMIN)`, `Paginated<UserListItem>`. `page ≥ 1`, `1 ≤ size ≤ 100`, 기본 20.
  - `ListUsersQuery` DTO 패턴(`page`, `size` + class-transformer 숫자 변환)은 M2 목록 API에서 공통 `PaginationQuery`로 끌어올린다.

- [ ] **Step 1: 실패하는 테스트**

```ts
it.each([['admin', 200], ['manager', 403], ['viewer', 403]])('GET /users as %s → %i', ...);
it('403 body is FORBIDDEN ApiErrorBody', ...);
it('POST without X-Requested-With → 403 CSRF_REQUIRED', async () => {
  const res = await request(server).post('/api/v1/auth/login').send({ email: 'admin@demo.com', password: PW });
  expect(res.status).toBe(403); expect(res.body.code).toBe('CSRF_REQUIRED');
});
it('rejects deactivated user with valid access token', async () => {
  const cookie = await loginAs('manager');
  await dataSource.query(`UPDATE users SET "isActive"=false WHERE email='manager@demo.com'`);
  expect((await request(server).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
});
it('role change takes effect without re-login', ...); // viewer 쿠키 유지 + DB에서 ADMIN으로 → GET /users 200
it('GET /users meta: size=2 over 3 users → totalPages 2', ...);
it('GET /users?size=101 → 400 VALIDATION_FAILED', ...);
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** (Interfaces대로)
- [ ] **Step 4: 통과 확인.** `pnpm --filter api test && pnpm --filter api test:e2e && pnpm --filter api lint && pnpm --filter api build` → 모두 PASS. `pnpm --filter api start:dev` 후 `http://localhost:4000/api/docs`에서 Swagger가 열리는지 확인한다.
- [ ] **Step 5: 커밋.** `feat: 역할 기반 접근 제어와 CSRF 헤더 검사 추가`

---

### Task 7: Next 앱 스캐폴딩 — 물타기 UI·규칙 이식, API 프록시

**Files:**

- Create: `apps/web/` (`pnpm create next-app@latest web --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*"` 후 정리)
- Copy from `$MTG`:
  - `app/globals.css`. 물타기 전용인 `--color-up`·`--color-down`은 제거하고, `brand`·`canvas`·`subtle` 등 나머지 토큰은 유지한다.
  - `components.json`, `eslint.config.mjs`(dayjs 규칙 포함 그대로), `vitest.config.ts`, `vitest.setup.ts`, `tsconfig.json`의 `paths`
  - `src/shared/ui/`: `button, card, input, label, dialog, alert-dialog, dropdown-menu, select, table, badge, skeleton, separator, popover, command, textarea, input-group, toggle, toggle-group, chart-tooltip, chart-empty, form-field, theme-provider`
  - `src/shared/lib/{utils,format-won,format-won.test,dayjs,dayjs.test}.ts`, `src/shared/api/query-provider.tsx`, `src/shared/testing/render-with-query.tsx`
  - `app/layout.tsx`. Pretendard `<link>`, ThemeProvider(`forcedTheme="light"`), QueryProvider 구조는 유지하고, 메타데이터와 `dohyeon` 폰트는 제거한다.
- Create: `src/shared/testing/msw-server.ts` (핸들러는 Task 8에서 채움), `src/shared/ui/sidebar.tsx` (`pnpm dlx shadcn@latest add sidebar`, 파일 맨 위에 `'use client'`)
- Modify: `apps/web/next.config.ts`
- Test: `src/shared/lib/format-won.test.ts`(복사본이 통과하는지), 빌드

**Interfaces:**

- Produces:
  - `next.config.ts`: `rewrites: [{ source: '/api/:path*', destination: \`${process.env.API_ORIGIN ?? 'http://localhost:4000'}/api/:path*\` }]`, `reactCompiler: true`, `turbopack.root`는 **모노레포 루트**(`path.resolve(__dirname, '../..')`)
  - `apps/web` dependencies에 `@bo/contracts: workspace:*`
  - dev 포트 3000, api 4000

- [ ] **Step 1: 스캐폴딩하고 파일 복사.** 의존성은 `$MTG/package.json`과 같은 메이저 버전으로 맞추되, 쓰지 않는 `cmdk`, `immer`, `motion`, `@hookform/resolvers`는 지금 넣지 않는다(쓰는 Task에서 추가).
- [ ] **Step 2: 확인.** `pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build` → 모두 PASS
- [ ] **Step 3: 프록시 확인.** api와 web을 함께 띄운 상태에서 `curl -s localhost:3000/api/v1/health` → `{"status":"ok","db":"up"}`
- [ ] **Step 4: 커밋.** `chore: 물타기 UI와 FSD 규칙을 이식한 Next 앱 구성`

---

### Task 8: HTTP 클라이언트 — 에러 정규화와 401 단일 refresh

**Files:**

- Create: `src/shared/api/http-client.ts`, `src/shared/api/api-error.ts`, `src/shared/api/mocks/auth.ts`
- Modify: `src/shared/testing/msw-server.ts` (authHandlers 등록)
- Test: `src/shared/api/http-client.test.ts`

**Interfaces:**

- Consumes: `ApiErrorBody`, `ErrorCode` (Task 1)
- Produces:
  - `class ApiError extends Error { status: number; code: ErrorCode; details?: unknown }`
  - `http<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>`. path는 `/api/v1` 기준 상대 경로(`'/auth/me'`). 항상 `credentials: 'include'`, `X-Requested-With: fetch`를 붙인다. `json`이 있으면 직렬화하고 Content-Type을 붙인다. 204면 `undefined`를 반환하고, 2xx가 아니면 `ApiError`를 던진다(본문이 ApiErrorBody가 아니면 code `INTERNAL`).
  - 401 처리: `/auth/login`·`/auth/refresh`·`/auth/logout`이 아닌 요청이 401을 받으면 `refreshOnce()`를 거쳐 **한 번만** 재시도한다. 그래도 실패하면 `onSessionExpired()`를 호출하고 원래 에러를 던진다.
  - `refreshOnce(): Promise<boolean>`. 진행 중인 Promise를 모듈 변수에 두어 여러 호출을 하나로 합친다.
  - `setSessionExpiredHandler(fn: () => void): void`. 기본 동작은 `window.location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search))`.
  - `authHandlers`: MSW 기본 핸들러 (`/api/v1/auth/me` → viewer MeResponse, login, logout, refresh 204)

- [ ] **Step 1: 실패하는 테스트**

```ts
it('throws ApiError with server code', async () => {
  server.use(http.get('/api/v1/x', () => HttpResponse.json({ statusCode: 403, code: 'FORBIDDEN', message: 'no' }, { status: 403 })));
  await expect(httpClient('/x')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
});
it('sends X-Requested-With: fetch', ...);
it('refreshes once for concurrent 401s', async () => {
  let refreshCalls = 0; let authed = false;
  server.use(
    http.post('/api/v1/auth/refresh', () => { refreshCalls++; authed = true; return new HttpResponse(null, { status: 204 }); }),
    http.get('/api/v1/a', () => authed ? HttpResponse.json(1) : HttpResponse.json(UNAUTH, { status: 401 })),
    http.get('/api/v1/b', () => authed ? HttpResponse.json(2) : HttpResponse.json(UNAUTH, { status: 401 })),
  );
  await expect(Promise.all([httpClient('/a'), httpClient('/b'), httpClient('/a')])).resolves.toEqual([1, 2, 1]);
  expect(refreshCalls).toBe(1);
});
it('calls session-expired handler when refresh fails', ...);
it('does not try refresh when /auth/login itself returns 401', ...);
```

(테스트에서는 import 이름 충돌을 피하려고 `http as httpClient`로 가져온다.)

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** (Interfaces대로). jsdom의 fetch는 상대 URL을 처리하지 못하므로, 테스트에서는 `vitest.config.ts`의 `environmentOptions.jsdom.url = 'http://localhost:3000'`을 쓴다.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋.** `feat: 401 단일 갱신을 처리하는 HTTP 클라이언트 추가`

---

### Task 9: 세션 엔티티와 로그인 화면

**Files:**

- Create: `src/shared/lib/sanitize-next.ts`, `src/entities/session/{model/query-keys.ts,model/use-me.ts,ui/can.tsx,index.ts}`, `src/features/auth-login/{model/login-schema.ts,ui/login-form.tsx,index.ts}`, `src/views/login/{ui/login-page.tsx,index.ts}`, `app/(auth)/login/page.tsx`
- Test: `src/shared/lib/sanitize-next.test.ts`, `src/entities/session/ui/can.test.tsx`, `src/features/auth-login/ui/login-form.test.tsx`

**Interfaces:**

- Consumes: `http`, `ApiError` (Task 8), `MeResponse`, `Permission`, `can` (Task 1)
- Produces:
  - `sanitizeNext(raw: string | null | undefined): string`. `/`로 시작하고 `//`·`/\`로 시작하지 않는 내부 경로만 그대로 돌려주고, 나머지는 `'/dashboard'`.
  - `sessionKeys.me = ['session', 'me'] as const`
  - `useMe(): UseQueryResult<MeResponse, ApiError>` (`staleTime` 5분, `retry: false`)
  - `<Can permission={Permission} fallback?={ReactNode}>{children}</Can>`. me가 없거나 권한이 없으면 fallback을 렌더한다.
  - `loginSchema = z.object({ email: z.string().trim().email('이메일 형식이 아닙니다'), password: z.string().min(1, '비밀번호를 입력하세요') })`
  - `<LoginForm onSuccess={(me: MeResponse) => void} />`. 제출하면 `POST /auth/login`. 성공하면 `sessionKeys.me` 캐시를 채우고 onSuccess를 호출한다. `INVALID_CREDENTIALS`이면 폼 상단에 "이메일 또는 비밀번호가 올바르지 않습니다"를 보여준다. 데모 계정 버튼 3개(관리자·매니저·뷰어)는 이메일과 비밀번호 칸을 채우기만 하고 제출은 하지 않는다.
  - `LoginPage`: `searchParams.next`를 `sanitizeNext`로 정리해 성공 시 `router.replace`한다. 물타기 Card 스타일로 화면 가운데에 배치한다.

- [ ] **Step 1: 실패하는 테스트**

```ts
it.each([
  ['/orders?status=PENDING', '/orders?status=PENDING'], ['https://evil.com', '/dashboard'],
  ['//evil.com', '/dashboard'], ['/\\evil.com', '/dashboard'], [null, '/dashboard'], ['', '/dashboard'],
])('sanitizeNext(%s) → %s', (raw, expected) => expect(sanitizeNext(raw)).toBe(expected));

it('Can hides children when VIEWER lacks product:write', ...); // MSW me → VIEWER
it('Can shows children for MANAGER product:write', ...);

it('shows validation messages without calling API', ...);
it('shows invalid-credentials message on 401 INVALID_CREDENTIALS', ...);
it('calls onSuccess with MeResponse on success', ...);
it('demo button fills fields without submitting', ...);
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현.** 폼은 RHF + zod로 만든다. 이때 `@hookform/resolvers`를 추가한다.
- [ ] **Step 4: 통과 확인.** `pnpm --filter web test && pnpm --filter web lint` → PASS (boundaries 위반 없음)
- [ ] **Step 5: 커밋.** `feat: 세션 조회와 로그인 화면 추가`

---

### Task 10: 라우트 보호 · 어드민 레이아웃 · 사이드바 · 로그아웃 · 403

**Files:**

- Create: `apps/web/proxy.ts`, `src/shared/lib/route-guard.ts`, `src/widgets/admin-sidebar/{lib/menu.ts,ui/admin-sidebar.tsx,index.ts}`, `src/features/auth-logout/{ui/logout-button.tsx,index.ts}`, `src/views/{dashboard,users,forbidden}/…`, `app/(admin)/layout.tsx`, `app/(admin)/dashboard/page.tsx`, `app/(admin)/users/page.tsx`, `app/forbidden/page.tsx`, `app/page.tsx`(`/dashboard`로 redirect)
- Test: `src/shared/lib/route-guard.test.ts`, `src/widgets/admin-sidebar/lib/menu.test.ts`, `src/features/auth-logout/ui/logout-button.test.tsx`, `src/views/users/ui/users-page.test.tsx`

**Interfaces:**

- Consumes: `useMe`, `Can` (Task 9), `can`, `Permission` (Task 1), `http` (Task 8), `sanitizeNext`
- Produces:
  - `resolveRouteRedirect(pathname: string, search: string, hasSessionCookie: boolean): string | null`. 보호 경로(`/login` 외 전부, `/_next`·`/api`·정적 파일 제외)인데 쿠키가 없으면 `/login?next=<인코딩된 path+search>`. `/login`인데 쿠키가 있으면 `/dashboard`. 둘 다 아니면 `null`.
  - `proxy.ts`: `request.cookies.has('bo_at')`로 `resolveRouteRedirect`를 호출한다. `config.matcher`에서 `_next`·`api`·`favicon.ico`를 제외한다. **Next 16 `proxy.ts` 규약은 `node_modules/next/dist/docs/`에서 확인한 뒤 작성한다**(물타기 AGENTS.md 경고).
  - `MENU: { href: string; label: string; icon: LucideIcon; permission: Permission }[]`: 대시보드(`dashboard:read`), 상품(`product:read`), 주문(`order:read`), 사용자(`user:manage`). 상품과 주문 링크는 M2·M3 전까지 "준비 중" 뱃지를 달고 비활성으로 둔다.
  - `visibleMenu(role: Role): typeof MENU`
  - `<AdminSidebar />`: Shadcn sidebar. 하단에 me 이름·역할 뱃지와 `<LogoutButton />`을 둔다.
  - `<LogoutButton />`: `POST /auth/logout` → `queryClient.clear()` → `router.replace('/login')`. 실패해도 같은 동작을 한다(쿠키는 서버가 지움).
  - `UsersPage`: 사용자 표(이름·이메일·역할·상태·가입일). me가 ADMIN이 아니거나 API가 403이면 `router.replace('/forbidden')`. 페이지 이동은 이전·다음 버튼만 둔다(정식 페이지네이션 컴포넌트는 M2).
  - `(admin)/layout.tsx`: `useMe` 로딩 중에는 사이드바 스켈레톤을 보여준다.

- [ ] **Step 1: 실패하는 테스트**

```ts
it.each([
  ['/dashboard', '', false, '/login?next=%2Fdashboard'],
  ['/orders', '?status=PENDING', false, '/login?next=%2Forders%3Fstatus%3DPENDING'],
  ['/login', '', true, '/dashboard'],
  ['/dashboard', '', true, null],
  ['/login', '', false, null],
])('resolveRouteRedirect(%s%s, cookie=%s) → %s', ...);

it('VIEWER sees dashboard·products·orders, not users', () =>
  expect(visibleMenu(Role.VIEWER).map((m) => m.href)).toEqual(['/dashboard', '/products', '/orders']));
it('ADMIN sees users', () => expect(visibleMenu(Role.ADMIN).map((m) => m.href)).toContain('/users'));

it('logout clears query cache and navigates to /login even if API fails', ...);
it('UsersPage redirects to /forbidden on 403', ...);
it('UsersPage renders rows from Paginated response', ...);
```

- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 구현** (Interfaces대로)
- [ ] **Step 4: 통과 확인.** `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build` → PASS
- [ ] **Step 5: 수동 E2E 확인.** `pnpm db:up && pnpm dev` 후 브라우저에서 확인한다.
  - 로그아웃 상태에서 `/users?x=1`로 들어가면 `/login?next=%2Fusers%3Fx%3D1`로 이동한다.
  - viewer로 로그인하면 사이드바에 사용자 메뉴가 없고, `/users`로 직접 들어가면 `/forbidden`으로 간다.
  - admin으로 로그인하면 `/users`에 3행이 보인다. 로그아웃하면 `/login`으로 가고, 뒤로가기를 해도 다시 `/login`이다.
  - DevTools에서 `bo_at` 쿠키 값을 망가뜨리고 새로고침하면 refresh로 복구된다. `bo_rt`까지 지우면 `/login?next=`로 간다.
- [ ] **Step 6: 커밋.** `feat: 라우트 보호와 권한별 어드민 사이드바 추가`

---

### Task 11: CI와 실행 문서

**Files:**

- Create: `.github/workflows/ci.yml`, `README.md`(실행 방법 섹션만. 설계 결정 섹션은 M6)
- Modify: `.env.example` (`DATABASE_URL`, `JWT_SECRET`, `SEED_PASSWORD`, `WEB_ORIGIN`, `API_ORIGIN` 전부)

**Interfaces:**

- Produces: CI 잡 하나(ubuntu-latest, Node LTS, `pnpm/action-setup`, pnpm store 캐시). 순서는 `pnpm install --frozen-lockfile` → `pnpm --filter @bo/contracts build` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm --filter api test:e2e`(ubuntu 러너에 Docker가 있어 Testcontainers 동작) → `pnpm build`

- [ ] **Step 1: 작성.** README 실행 방법은 아래 네 단계다.
  1. `cp .env.example .env`
  2. `pnpm install`
  3. `pnpm db:up && pnpm --filter api db:migrate && pnpm --filter api db:seed`
  4. `pnpm dev`

  끝에 데모 계정 표를 붙인다.

- [ ] **Step 2: 로컬 전체 검증.** 저장소를 새 디렉토리에 클론해 README 순서대로만 실행한다. `localhost:3000`에서 admin으로 로그인할 수 있으면 성공이다. 이어서 루트에서 `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter api test:e2e && pnpm build` → 모두 PASS
- [ ] **Step 3: 커밋.** `chore: CI 워크플로와 로컬 실행 문서 추가`
- [ ] **Step 4: (GitHub 원격이 있으면) 푸시한 뒤 Actions가 초록색인지 확인**
