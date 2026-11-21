# CLAUDE.md

이 저장소에서 작업할 때 따르는 규칙이다. 설계의 근거는 `docs/2026-11-20-commerce-backoffice-design.md`에 있고,
이 파일은 그 설계를 코드로 옮길 때 지킬 약속만 담는다.

## 프로젝트 개요

**commerce-backoffice**: 이커머스 운영자용 백오피스(상품·주문·재고·사용자 관리).
화면만 있는 목업이 아니라 API 서버가 끝까지 동작하고, 인증·권한·페이지네이션·트랜잭션을 테스트로 증명한다.

진행 단계: M0 기반 → M1 인증·권한 → M2 상품·이미지 → M3 주문·트랜잭션 → M4 대시보드 → M5 엑셀 → M6 마무리·배포.
단계마다 `docs/superpowers/plans/`에 구현 계획을 따로 둔다.

## 저장소 구조

```
apps/api            NestJS API (패키지명 api)
apps/web            Next.js 어드민 (패키지명 web)
packages/contracts  @bo/contracts: API와 Web이 함께 쓰는 TS 타입·enum (tsup으로 ESM+CJS 빌드)
docs/               설계 문서, 단계별 구현 계획
```

## 기술 스택 (고정)

| 영역        | 선택                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| 패키지 관리 | **pnpm 전용** (npm·yarn 금지), Node 24                                                                      |
| 언어        | TypeScript **^6.0.3**, 모든 패키지 `strict: true` (TS 7은 tsup dts 빌드를 깨뜨린다)                         |
| API         | NestJS 12 (ESM 전용), TypeORM 1.x, PostgreSQL 16, class-validator                                           |
| Web         | Next.js 16 (App Router), React 19, TanStack Query v5, Zustand, Shadcn UI + Tailwind v4, RHF + zod, recharts |
| 테스트      | Vitest 5 (전 패키지 공통), API e2e는 Testcontainers, Web은 RTL + MSW 2                                      |
| 린트·포맷   | Web: ESLint 9 + eslint-plugin-boundaries / API: oxlint / Prettier (루트 설정)                               |

새 라이브러리는 위 스택으로 해결되지 않을 때만 들인다. Vitest·TypeScript 메이저는 워크스페이스 전체가 같아야 한다.

**Next.js 주의:** 이 버전은 학습 데이터와 다르다. Next 관련 코드를 쓰기 전에 `apps/web/AGENTS.md`의 안내대로
`apps/web/node_modules/next/dist/docs/`를 읽는다. 예를 들어 미들웨어는 `proxy.ts`다.

## 명령어 (루트에서 실행)

```bash
pnpm db:up            # PostgreSQL 기동 (헬스체크 통과까지 대기)
pnpm db:up:storage    # S3 호환 스토리지까지 기동 (이미지 업로드부터 필요)
pnpm db:migrate       # contracts·api 빌드 후 마이그레이션
pnpm db:seed          # 데모 데이터 (멱등)
pnpm dev              # web :3000 + api :4000
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build && pnpm format:check
```

**완료 보고 전에는 마지막 줄의 검증을 모두 통과시킨다.** CI(`.github/workflows/ci.yml`)도 같은 순서로 돈다.
`pnpm test:e2e`는 Docker가 필요하다.

로컬 환경 메모:

- PostgreSQL 호스트 포트는 **5433**(`PG_PORT`)이다. 이 머신에는 다른 로컬 Postgres가 5432를 쓰고 있으니 건드리지 않는다.
- 환경 변수는 루트 `.env` 하나다. api 스크립트는 `--env-file-if-exists=../../.env`로 읽는다. `.env`는 커밋하지 않는다.
- 데모 계정은 `admin@demo.com` / `manager@demo.com` / `viewer@demo.com`이고, 비밀번호는 `demo1234!`(`SEED_PASSWORD`)다.

## 공통 계약 (`@bo/contracts`)

- API 응답과 Web이 공유하는 타입·enum·권한 맵은 **여기에만** 정의한다. 양쪽에 같은 타입을 따로 선언하지 않는다.
- 타입·enum·순수 함수만 둔다. 검증 로직은 각 앱이 가진다(API는 class-validator, Web은 zod).
- 계약을 바꾸면 `pnpm --filter @bo/contracts build` 후 양쪽 타입체크를 돌린다.

## API 규칙 (`apps/api`)

**구조:** 도메인별 Nest 모듈(`users/`, `auth/`, …)에 `*.entity.ts`, `*.service.ts`, `*.controller.ts`, `dto/`를 둔다.
여러 모듈이 쓰는 것은 `common/`에 둔다(데코레이터, 가드, 예외, 이메일 정규화, `API_PREFIX`).
도메인 모듈끼리 파일을 직접 import하지 않는다. 예를 들어 `users/`는 `auth/`를 모른다. ESM이므로 상대 import에는 `.js` 확장자를 붙인다.

**HTTP 규약:**

- 접두사는 `/api/v1`(`API_PREFIX`)이고, Swagger는 `/api/docs`다.
- 에러는 항상 `{ statusCode, code: ErrorCode, message, details? }`다. `AppException(status, code, message, details?)`으로 던지고, 500의 원문 메시지는 응답에 담지 않는다.
- 목록은 `Paginated<T>` = `{ items, meta: { page, size, total, totalPages } }`다. `page ≥ 1`, `1 ≤ size ≤ 100`이며, 정렬 컬럼은 화이트리스트로 제한한다.
- 상태를 바꾸는 요청(POST·PATCH·PUT·DELETE)은 `X-Requested-With: fetch` 헤더가 필요하다(`CsrfGuard`).

**인증·권한:**

- 가드는 `APP_GUARD`로 `CsrfGuard → JwtAuthGuard → RolesGuard` 순서다. 기본은 인증 필요이고, 예외는 `@Public()`으로 연다.
- 권한은 `@Roles(Role.MANAGER)`처럼 최소 역할로 표시한다(ADMIN ⊃ MANAGER ⊃ VIEWER). 프론트의 노출 제어는 UX일 뿐이고 보안은 서버가 책임진다.
- 쿠키 설정을 바꾸지 않는다:
  - `bo_at`: httpOnly, Lax, `Path=/`
  - `bo_rt`: httpOnly, Strict, `Path=/api/v1/auth`
  - `Secure`는 production에서만
- JwtStrategy는 매 요청 DB에서 사용자를 다시 읽는다. 그래서 비활성화와 역할 변경이 바로 반영된다.
- 오브젝트 스토리지는 `storage/`의 `ObjectStorage`를 `OBJECT_STORAGE` 토큰으로 주입받아 쓴다. AWS SDK는 그 밖에서 호출하지 않는다. 이미지 URL은 `/media/{key}`다.

**DB:**

- `synchronize: false`다. 스키마는 마이그레이션(`src/database/migrations/`, TypeORM CLI로 생성 후 검토)으로만 바꾼다.
- 금액은 정수(원)다.
- 트랜잭션 안의 조회와 쓰기는 반드시 그 트랜잭션의 `manager`로 한다. 기본 리포지토리를 쓰면 커넥션 풀 교착이 생긴다.
- 트랜잭션 안에서 401·409를 던지면 롤백된다. 남겨야 하는 쓰기(예: 토큰 폐기)가 있으면 결과를 반환해 커밋한 뒤, 트랜잭션 밖에서 던진다.

## Web 규칙 (`apps/web`): FSD 경량 5레이어

`app/`은 라우팅 껍데기이고, 실제 코드는 `src/`에 둔다. `app/**/page.tsx`와 `layout.tsx`는 `@/views/*`만 import한다.

```
app → views → widgets → features → entities → shared   (단방향, eslint-plugin-boundaries로 강제)
```

- 역방향 import와 같은 레이어의 슬라이스 간 import는 금지다. 공유가 필요하면 아래 레이어로 내린다.
- 슬라이스는 `index.ts`로만 노출한다. `shared`만 하위 경로를 직접 import할 수 있다(`@/shared/ui/button`).
- 경계 위반을 `eslint-disable`로 우회하지 않는다. 구조를 고친다.
- 세그먼트는 `ui/`, `model/`, `lib/`, `api/` 중 필요한 것만 만든다.

**상태:**

| 상태                                      | 위치                                             |
| ----------------------------------------- | ------------------------------------------------ |
| 서버 데이터                               | TanStack Query. 쿼리는 `entities/*/model`에 둔다 |
| 목록 필터·정렬·페이지                     | **URL 쿼리**. 새로고침해도 유지된다              |
| UI 설정(사이드바, 컬럼 표시, 페이지 크기) | Zustand + persist                                |
| 토큰                                      | httpOnly 쿠키에만 둔다. JS에서 다루지 않는다     |

**API 호출:**

- `@/shared/api`의 `http<T>(path, init)`만 쓴다. path는 `/api/v1` 기준 상대 경로다.
- 이 함수는 CSRF 헤더, `credentials`, 401 단일 refresh, `ApiError` 정규화를 책임진다. `fetch`를 직접 부르지 않는다.
- 외부에서 받은 이동 경로(`next` 등)는 `sanitizeNext`를 거친다.

**UI:**

- Shadcn 컴포넌트는 `src/shared/ui/`에 둔다(`pnpm dlx shadcn@latest add <name>`). 클라이언트 API를 쓰면 `'use client'`를 붙인다.
- 색은 `app/globals.css` 토큰(물타기 디자인)만 쓴다. 다크모드는 범위 밖이다.
- 테이블은 로딩 스켈레톤, 빈 상태, 에러와 "다시 시도"를 모두 갖춘다.
- 날짜는 `@/shared/lib/dayjs`의 `kst()`로만 다룬다(dayjs 직접 import 금지). 금액은 `format-won`으로 표시한다.

## 테스트

- 테스트 파일은 대상 옆에 둔다: Web·contracts는 `*.test.ts(x)`, API 단위는 `*.spec.ts`. API e2e는 `apps/api/test/*.e2e-spec.ts`.
- API e2e는 `createTestApp()`(`test/setup-app.ts`)으로 실제 `AppModule`을 Testcontainers Postgres 위에 띄운다. 테스트끼리 상태를 공유하지 않는다(`beforeEach`에서 TRUNCATE, 원복은 `try/finally`).
- API e2e는 Vitest globalSetup이 Postgres·s3mock 컨테이너를 실행당 하나씩 띄워 공유하고, `createTestApp()`이 파일마다 DB와 버킷을 따로 만든다.
- Web은 MSW로 네트워크를 흉내 낸다(`onUnhandledRequest: 'error'`). `http`를 mock하지 말고 핸들러를 `server.use()`로 바꾼다.
- 트랜잭션, 권한, 동시성처럼 틀리면 안 되는 로직은 실제 DB로 검증한다.
- 테스트 출력에 경고가 없어야 한다(act 경고 포함).

## 네이밍

| 대상                 | 규칙                             | 예                                  |
| -------------------- | -------------------------------- | ----------------------------------- |
| 폴더·파일·슬라이스   | kebab-case                       | `product-filter/`, `users-page.tsx` |
| 컴포넌트·타입·클래스 | PascalCase                       | `ProductTable`, `Paginated`         |
| 훅                   | 파일 `use-xxx.ts`, 함수 `useXxx` | `use-products.ts`                   |
| 상수                 | UPPER_SNAKE_CASE                 | `API_PREFIX`                        |

컴포넌트는 named export를 쓴다. 단, Next 규약 파일(`page.tsx`, `layout.tsx`)은 default export다.

## 커밋

Conventional Commits를 따르고, **`<type>:` 뒤 제목과 본문은 한글**로 쓴다. 제목 끝에 마침표를 찍지 않는다.
작업은 단계별로 쪼개서 커밋한다.

- type: `feat` `fix` `refactor` `chore` `build` `test` `docs` `style`
- 예: `feat: 상품 목록 필터와 URL 동기화 추가`
- 기능 브랜치에서 작업한다(`feat/m2-products` 등). `main`에 직접 커밋하지 않는다. push와 PR은 요청이 있을 때만 한다.
